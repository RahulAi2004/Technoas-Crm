-- Auto-numbering + auto-qualification for new leads (Updated2 format)
CREATE SEQUENCE IF NOT EXISTS app.lead_no_seq;
SELECT setval('app.lead_no_seq', GREATEST(662, COALESCE((SELECT MAX(NULLIF(REGEXP_REPLACE(lead_no, '\D', '', 'g'), '')::bigint) FROM app.leads WHERE lead_no LIKE 'LEAD-%'), 0)));

CREATE OR REPLACE FUNCTION app.assign_lead_no() RETURNS trigger AS $$
BEGIN
  IF NEW.lead_no IS NULL THEN
    NEW.lead_no := 'LEAD-' || TO_CHAR(nextval('app.lead_no_seq'), 'FM000000');
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_lead_no ON app.leads;
CREATE TRIGGER trg_assign_lead_no BEFORE INSERT ON app.leads
  FOR EACH ROW EXECUTE FUNCTION app.assign_lead_no();

CREATE OR REPLACE FUNCTION app.ensure_lead_qualification() RETURNS trigger AS $$
BEGIN
  INSERT INTO app.lead_qualification (lead_id) VALUES (NEW.lead_id) ON CONFLICT (lead_id) DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_qualification ON app.leads;
CREATE TRIGGER trg_lead_qualification AFTER INSERT ON app.leads
  FOR EACH ROW EXECUTE FUNCTION app.ensure_lead_qualification();
