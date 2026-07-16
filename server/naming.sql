-- ============================================================
-- PRINTSHOP NAMING CONVENTION (developer handoff) — 2026-07-16
-- Picks implemented now:
--   • customers.client_code  — 3-letter public code + 2-digit suffix (JCA01 / HAR01 style)
--       - individual: 1st letter + first 2 of last name   (John Carter -> JCA01)
--       - company   : 1st letter of first 3 meaningful words (ignore LTD/LLC/INC/THE)
--       - stored in DB, auto on INSERT, NEVER changed later; collision -> JCA02, JCA03…
--   • app.series_counters    — generic per-key counters (handoff §8)
--   • artwork numbering      — AW-<CLIENT>-<NNNN>-SRC  (per-customer counter, SRC = customer-sent)
--       - old SRC-ART-YY-NNNN numbers preserved in legacy_no
-- NON-DESTRUCTIVE: ADD/CREATE IF NOT EXISTS only.
-- ============================================================

-- 1) client code column
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS client_code VARCHAR(10);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_client_code ON app.customers(client_code);

-- 2) generic series counters (handoff: series_counters)
CREATE TABLE IF NOT EXISTS app.series_counters (
  key   TEXT PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
);
CREATE OR REPLACE FUNCTION app.next_series(k TEXT) RETURNS INT AS $$
DECLARE n INT;
BEGIN
  INSERT INTO app.series_counters(key, value) VALUES (k, 1)
    ON CONFLICT (key) DO UPDATE SET value = app.series_counters.value + 1
    RETURNING value INTO n;
  RETURN n;
END $$ LANGUAGE plpgsql;

-- 3) client-code base letters (handoff §3)
CREATE OR REPLACE FUNCTION app.client_code_base(nm TEXT) RETURNS TEXT AS $$
DECLARE words TEXT[]; base TEXT := '';
BEGIN
  nm := upper(regexp_replace(coalesce(nm, ''), '[^A-Za-z ]', '', 'g'));
  SELECT array_agg(x) INTO words
    FROM unnest(string_to_array(nm, ' ')) x
   WHERE x <> '' AND x NOT IN ('LTD','LLC','INC','THE','CO','COMPANY');
  IF words IS NULL OR array_length(words, 1) = 0 THEN RETURN 'UNK'; END IF;
  IF array_length(words, 1) >= 3 THEN
    base := left(words[1],1) || left(words[2],1) || left(words[3],1);   -- company style: GPS
  ELSIF array_length(words, 1) = 2 THEN
    base := left(words[1],1) || left(words[2],2);                        -- individual: JCA
  ELSE
    base := left(words[1],3);
  END IF;
  RETURN rpad(base, 3, 'X');
END $$ LANGUAGE plpgsql IMMUTABLE;

-- 4) auto-assign client_code on new customers (collision -> next 2-digit suffix)
CREATE OR REPLACE FUNCTION app.assign_client_code() RETURNS trigger AS $$
DECLARE b TEXT; n INT := 0;
BEGIN
  IF NEW.client_code IS NULL THEN
    b := app.client_code_base(NEW.full_name);
    LOOP
      n := n + 1;
      NEW.client_code := b || lpad(n::text, 2, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM app.customers WHERE client_code = NEW.client_code);
    END LOOP;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_client_code ON app.customers;
CREATE TRIGGER trg_client_code BEFORE INSERT ON app.customers
  FOR EACH ROW EXECUTE FUNCTION app.assign_client_code();

-- 5) backfill client_code for existing customers (oldest first -> gets 01)
DO $$
DECLARE r RECORD; b TEXT; n INT; code TEXT;
BEGIN
  FOR r IN SELECT customer_id, full_name FROM app.customers WHERE client_code IS NULL ORDER BY created_at, customer_id LOOP
    b := app.client_code_base(r.full_name); n := 0;
    LOOP
      n := n + 1; code := b || lpad(n::text, 2, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM app.customers WHERE client_code = code);
    END LOOP;
    UPDATE app.customers SET client_code = code WHERE customer_id = r.customer_id;
  END LOOP;
END $$;

-- 6) NEW artwork numbering: AW-<CLIENT>-<NNNN>-SRC (per-customer series)
CREATE OR REPLACE FUNCTION app.assign_src_art_no() RETURNS trigger AS $$
DECLARE code TEXT; n INT;
BEGIN
  IF NEW.artwork_no IS NULL THEN
    SELECT client_code INTO code FROM app.customers WHERE customer_id = NEW.customer_id;
    code := coalesce(code, 'UNK00');
    n := app.next_series('AW-' || code);
    NEW.artwork_no := 'AW-' || code || '-' || lpad(n::text, 4, '0') || '-SRC';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- 7) renumber existing artworks to the new format (old number kept in legacy_no)
ALTER TABLE app.customer_artwork ADD COLUMN IF NOT EXISTS legacy_no VARCHAR(30);
WITH ranked AS (
  SELECT ca.artwork_id,
         'AW-' || coalesce(c.client_code, 'UNK00') || '-' ||
         lpad(row_number() OVER (PARTITION BY coalesce(ca.customer_id::text, '-')
                                 ORDER BY ca.created_at, ca.artwork_id)::text, 4, '0') || '-SRC' AS new_no
    FROM app.customer_artwork ca
    LEFT JOIN app.customers c ON c.customer_id = ca.customer_id
   WHERE ca.artwork_no LIKE 'SRC-ART-%'
)
UPDATE app.customer_artwork ca
   SET legacy_no = ca.artwork_no, artwork_no = ranked.new_no
  FROM ranked WHERE ranked.artwork_id = ca.artwork_id;

-- 8) counters ko current max par set karo (naye artworks aage se continue karein)
INSERT INTO app.series_counters(key, value)
SELECT 'AW-' || coalesce(c.client_code, 'UNK00'), count(*)
  FROM app.customer_artwork ca
  LEFT JOIN app.customers c ON c.customer_id = ca.customer_id
 GROUP BY 1
ON CONFLICT (key) DO UPDATE SET value = GREATEST(app.series_counters.value, EXCLUDED.value);
