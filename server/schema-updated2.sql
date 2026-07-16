-- ============================================================
-- Decoinks-Database-Tables-Updated2.xlsx alignment (2026-07-16)
-- NON-DESTRUCTIVE: only ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- Old columns are kept untouched (rollback = just stop using the new ones).
-- ============================================================

-- ---- lead table → Updated2 "lead" format ----
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS lead_no                 VARCHAR(30);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS customer_name           UUID REFERENCES app.customers;      -- xlsx: FK link to customer/prospect (ALWAYS set)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS conversation_primary_id UUID REFERENCES app.conversations;  -- xlsx: main conversation
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS instagram_id            VARCHAR(80);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS facebook_id             VARCHAR(80);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS assigned_user_id        UUID REFERENCES app.agents;
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS lead_stage              VARCHAR(50);   -- pipeline stage (AI)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS lead_status             VARCHAR(20);   -- Active / Won / Lost / Dormant (AI)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS priority                VARCHAR(10);   -- Low / Medium / High / Urgent (AI)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS source_platform         VARCHAR(40);   -- channel (may already exist)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS source_campaign         VARCHAR(120);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS next_followup_date      TIMESTAMPTZ;
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS last_contact_at         TIMESTAMPTZ;
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS created_by              UUID REFERENCES app.agents;
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS updated_by              UUID REFERENCES app.agents;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_leads_lead_no ON app.leads(lead_no) WHERE lead_no IS NOT NULL;

-- ---- lead_qualification (Updated2, 1:1 with lead) ----
CREATE TABLE IF NOT EXISTS app.lead_qualification (
  lead_id                    UUID PRIMARY KEY REFERENCES app.leads ON DELETE CASCADE,
  sizes_received             BOOLEAN DEFAULT FALSE,   -- AI
  artwork_received           BOOLEAN DEFAULT FALSE,   -- AI
  delivery_date_confirmed    BOOLEAN DEFAULT FALSE,   -- AI
  shipping_address_confirmed BOOLEAN DEFAULT FALSE,   -- AI
  budget_confirmed           BOOLEAN DEFAULT FALSE,   -- AI
  payment_method_pref        VARCHAR(20),             -- AI
  info_completeness_score    SMALLINT,                -- AI (0-100)
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Backfill existing leads into the Updated2 format
-- ============================================================

-- lead_no: keep existing lead_number, else generate LEAD-000001…
UPDATE app.leads SET lead_no = lead_number WHERE lead_no IS NULL AND lead_number IS NOT NULL;
WITH numbered AS (
  SELECT lead_id, 'LEAD-' || TO_CHAR(ROW_NUMBER() OVER (ORDER BY created_at, lead_id)
    + COALESCE((SELECT MAX(NULLIF(REGEXP_REPLACE(lead_no, '\D', '', 'g'), '')::bigint) FROM app.leads WHERE lead_no LIKE 'LEAD-%'), 0), 'FM000000') AS new_no
  FROM app.leads WHERE lead_no IS NULL
)
UPDATE app.leads l SET lead_no = n.new_no FROM numbered n WHERE l.lead_id = n.lead_id;

UPDATE app.leads SET customer_name           = customer_id       WHERE customer_name IS NULL;
UPDATE app.leads SET conversation_primary_id = conversation_id   WHERE conversation_primary_id IS NULL;
UPDATE app.leads SET assigned_user_id        = assigned_agent_id WHERE assigned_user_id IS NULL;
UPDATE app.leads SET lead_stage              = COALESCE(lead_stage, stage, 'new_inquiry');

UPDATE app.leads SET lead_status = CASE
    WHEN status ILIKE '%won%'                          THEN 'Won'
    WHEN status ILIKE '%lost%' OR status ILIKE '%closed%' THEN 'Lost'
    WHEN status ILIKE '%dormant%' OR status ILIKE '%inactive%' THEN 'Dormant'
    ELSE 'Active' END
  WHERE lead_status IS NULL;

UPDATE app.leads SET priority = CASE lower(COALESCE(score_temperature, ''))
    WHEN 'hot' THEN 'High' WHEN 'warm' THEN 'Medium' WHEN 'cold' THEN 'Low'
    ELSE 'Medium' END
  WHERE priority IS NULL;

UPDATE app.leads SET source_platform = COALESCE(source_platform, source);
UPDATE app.leads SET source_campaign = COALESCE(source_campaign, campaign_name);

-- instagram_id / facebook_id + last_contact_at from the linked conversation
UPDATE app.leads l SET
  instagram_id    = CASE WHEN c.channel ILIKE '%insta%' THEN c.meta_sender_id ELSE l.instagram_id END,
  facebook_id     = CASE WHEN c.channel ILIKE '%face%'  THEN c.meta_sender_id ELSE l.facebook_id  END,
  last_contact_at = COALESCE(l.last_contact_at, c.last_message_at, l.updated_at)
FROM app.conversations c
WHERE c.conversation_id = l.conversation_id;

-- one qualification row per lead (defaults; AI fills later)
INSERT INTO app.lead_qualification (lead_id)
SELECT lead_id FROM app.leads
ON CONFLICT (lead_id) DO NOTHING;
