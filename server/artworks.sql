-- ============================================================
-- SOURCE ARTWORKS (customer-sent only) — 2026-07-16
-- Jab bhi customer koi image/artwork bhejta hai:
--   • number milta hai  SRC-ART-<YY>-<NNNN>   (SRC = source = customer ka bheja hua)
--   • asli image BYTES PostgreSQL mein store hote hain (Meta CDN URLs expire ho jate hain)
--   • lead ke naam ka folder tag hota hai (aur disk par bhi likha jata hai)
-- NON-DESTRUCTIVE: sirf CREATE IF NOT EXISTS. Agent ke bheje mockups YAHAN NAHI aate.
-- ============================================================

CREATE TABLE IF NOT EXISTS app.customer_artwork (
  artwork_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_no      VARCHAR(30) UNIQUE,          -- SRC-ART-26-0001 (trigger se)
  lead_id         UUID,
  customer_id     UUID,
  conversation_id UUID,
  message_ref     TEXT UNIQUE,                 -- source message id + attachment index (dedupe)
  folder          VARCHAR(200),                -- "LEAD-000663 Demetrease Davis"
  file_name       VARCHAR(200),
  file_type       VARCHAR(20),
  file_size_bytes BIGINT,
  source_url      TEXT,                        -- original CDN url (expire hota hai — bytes hi sach hain)
  image_data      BYTEA,                       -- asli image, PostgreSQL mein
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_lead     ON app.customer_artwork(lead_id);
CREATE INDEX IF NOT EXISTS idx_ca_customer ON app.customer_artwork(customer_id);
CREATE INDEX IF NOT EXISTS idx_ca_conv     ON app.customer_artwork(conversation_id);

CREATE SEQUENCE IF NOT EXISTS app.src_art_seq;

CREATE OR REPLACE FUNCTION app.assign_src_art_no() RETURNS trigger AS $$
BEGIN
  IF NEW.artwork_no IS NULL THEN
    NEW.artwork_no := 'SRC-ART-' || to_char(now(), 'YY') || '-' || lpad(nextval('app.src_art_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_src_art_no ON app.customer_artwork;
CREATE TRIGGER trg_src_art_no BEFORE INSERT ON app.customer_artwork
  FOR EACH ROW EXECUTE FUNCTION app.assign_src_art_no();
