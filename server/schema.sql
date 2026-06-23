-- ============================================================
-- PrintShop / Technocas CRM — Robust normalized schema (Phase 2)
-- Stack: PostgreSQL 15 + Qdrant (vectors, external) + OpenAI + Meta Graph API
-- NO Chatwoot (direct Meta), NO pgvector tables (Qdrant holds embeddings).
-- Lives in its own "app" schema so the current JSONB tables (public.*) stay untouched.
-- Safe to run repeatedly (IF NOT EXISTS everywhere).
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy text search
CREATE SCHEMA IF NOT EXISTS app;

-- ---------- Identity & Team ----------
CREATE TABLE IF NOT EXISTS app.organizations (
  organization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50),           -- school, business, sports_team, church, other
  industry        VARCHAR(100),
  website         TEXT,
  tier            VARCHAR(20) DEFAULT 'standard',
  total_orders    INT DEFAULT 0,
  total_spent     NUMERIC(12,2) DEFAULT 0,
  billing_address JSONB,
  status          VARCHAR(20) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.agents (
  agent_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id     TEXT UNIQUE,            -- maps to old users.id
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  role          VARCHAR(20) DEFAULT 'agent',  -- admin, manager, agent, designer
  timezone      VARCHAR(50),
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.customers (
  customer_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        TEXT UNIQUE,         -- maps to old customers.id / conversation id
  full_name        VARCHAR(255) NOT NULL,
  email            VARCHAR(255),
  phone            VARCHAR(40),
  company          VARCHAR(255),
  organization_id  UUID REFERENCES app.organizations,
  platform_primary VARCHAR(20),         -- messenger, instagram, whatsapp, email, web
  city             VARCHAR(100),
  country          VARCHAR(100),
  language_preference VARCHAR(10) DEFAULT 'en',
  lead_source      VARCHAR(100),
  tier             VARCHAR(20) DEFAULT 'lead',
  total_orders     INT DEFAULT 0,
  total_spent      NUMERIC(12,2) DEFAULT 0,
  payment_status   VARCHAR(20),         -- paid, pending, none
  engagement_score INT DEFAULT 0,
  churn_risk_score INT DEFAULT 0,
  products         TEXT,
  avatar           TEXT,
  status           VARCHAR(20) DEFAULT 'active',
  first_contact_date TIMESTAMPTZ,
  last_contact_date  TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_cust_name ON app.customers USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_app_cust_tier ON app.customers(tier, total_spent DESC);

CREATE TABLE IF NOT EXISTS app.customer_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID REFERENCES app.customers ON DELETE CASCADE,
  channel      VARCHAR(20) NOT NULL,    -- messenger, instagram, whatsapp, email
  channel_uid  VARCHAR(255) NOT NULL,   -- PSID / IGSID / phone / email
  display_name VARCHAR(255),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_channel_uid ON app.customer_channels(channel, channel_uid);

-- ---------- Communication ----------
CREATE TABLE IF NOT EXISTS app.conversations (
  conversation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id         TEXT UNIQUE,           -- old conv id e.g. "fb:123"
  meta_thread_id    VARCHAR(120),          -- Meta thread (t_...)
  meta_sender_id    VARCHAR(120),          -- customer PSID/IGSID
  customer_id       UUID REFERENCES app.customers,
  agent_id          UUID REFERENCES app.agents,
  channel           VARCHAR(20),           -- Facebook, Instagram, WhatsApp, Email
  status            VARCHAR(20) DEFAULT 'open',
  unread            INT DEFAULT 0,
  bookmarked        BOOLEAN DEFAULT false,
  total_messages    INT DEFAULT 0,
  first_response_sec INT,
  sentiment_overall VARCHAR(20),
  intent_primary    VARCHAR(80),
  last_message_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_conv_customer ON app.conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_app_conv_last ON app.conversations(last_message_at DESC);

CREATE TABLE IF NOT EXISTS app.messages (
  message_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id        TEXT UNIQUE,            -- old message id / Meta mid
  meta_message_id  VARCHAR(160),
  conversation_id  UUID REFERENCES app.conversations ON DELETE CASCADE,
  direction        VARCHAR(10) NOT NULL,   -- in, out, note
  sender_type      VARCHAR(20),            -- customer, agent, system
  agent_id         UUID REFERENCES app.agents,
  body             TEXT,
  message_type     VARCHAR(20) DEFAULT 'text',  -- text, image, video, file
  attachments      JSONB DEFAULT '[]',
  category         VARCHAR(30),            -- for notes: internal/call/meeting/followup
  intent           VARCHAR(120),           -- AI per-message summary/intent
  qdrant_point_id  VARCHAR(80),            -- linkage to Qdrant vector
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_msg_conv ON app.messages(conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_app_msg_dir ON app.messages(direction);

-- ---------- Sales pipeline ----------
CREATE TABLE IF NOT EXISTS app.leads (
  lead_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id         TEXT UNIQUE,
  lead_number       VARCHAR(24) UNIQUE,
  customer_id       UUID REFERENCES app.customers,
  organization_id   UUID REFERENCES app.organizations,
  conversation_id   UUID REFERENCES app.conversations,
  stage             VARCHAR(50) DEFAULT 'new_inquiry',
  status            VARCHAR(30) DEFAULT 'New',
  source            VARCHAR(100),
  score_total       INT DEFAULT 0,
  score_temperature VARCHAR(10),           -- hot, warm, cold
  primary_product   VARCHAR(80),
  estimated_value   NUMERIC(10,2) DEFAULT 0,
  assigned_agent_id UUID REFERENCES app.agents,
  deadline          DATE,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_leads_stage ON app.leads(stage, score_total DESC);
CREATE INDEX IF NOT EXISTS idx_app_leads_customer ON app.leads(customer_id);

CREATE TABLE IF NOT EXISTS app.lead_items (
  lead_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID REFERENCES app.leads ON DELETE CASCADE,
  product_type VARCHAR(50),
  garment_type VARCHAR(50),
  quantity     INT,
  sizes        JSONB,
  unit_price   NUMERIC(10,2),
  total_price  NUMERIC(10,2),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.tags (
  tag_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  category     VARCHAR(50),
  color        VARCHAR(20)
);
CREATE TABLE IF NOT EXISTS app.lead_tags (
  lead_id UUID REFERENCES app.leads ON DELETE CASCADE,
  tag_id  UUID REFERENCES app.tags ON DELETE CASCADE,
  PRIMARY KEY (lead_id, tag_id)
);

CREATE TABLE IF NOT EXISTS app.follow_ups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID REFERENCES app.leads ON DELETE CASCADE,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  message_text  TEXT,
  attempt       INT DEFAULT 1,
  status        VARCHAR(20) DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Quotes / Orders / Payments ----------
CREATE TABLE IF NOT EXISTS app.quotes (
  quote_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(24) UNIQUE,
  customer_id  UUID REFERENCES app.customers,
  lead_id      UUID REFERENCES app.leads,
  agent_id     UUID REFERENCES app.agents,
  line_items   JSONB DEFAULT '[]',
  subtotal     NUMERIC(10,2),
  discount     NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency     VARCHAR(3) DEFAULT 'USD',
  status       VARCHAR(20) DEFAULT 'draft',
  valid_until  DATE,
  pdf_url      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.orders (
  order_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       TEXT UNIQUE,
  order_number    VARCHAR(24) UNIQUE,
  customer_id     UUID REFERENCES app.customers,
  conversation_id UUID REFERENCES app.conversations,
  quote_id        UUID REFERENCES app.quotes,
  products        TEXT,
  items_count     INT DEFAULT 0,
  total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(3) DEFAULT 'USD',
  order_status    VARCHAR(30) DEFAULT 'pending',
  payment_status  VARCHAR(20) DEFAULT 'pending',
  deadline        DATE,
  owner_agent_id  UUID REFERENCES app.agents,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (total_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_app_orders_customer ON app.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_app_orders_status ON app.orders(order_status, payment_status);

CREATE TABLE IF NOT EXISTS app.payments (
  payment_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id      TEXT UNIQUE,
  invoice_number VARCHAR(24),
  order_id       UUID REFERENCES app.orders,
  customer_id    UUID REFERENCES app.customers,
  amount         NUMERIC(10,2) NOT NULL,
  currency       VARCHAR(3) DEFAULT 'USD',
  method         VARCHAR(50),             -- PayPal, Zelle, Card, Cash, Bank Transfer
  status         VARCHAR(20) DEFAULT 'completed',
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_app_pay_customer ON app.payments(customer_id);

-- ---------- Artwork & Files ----------
CREATE TABLE IF NOT EXISTS app.artwork (
  artwork_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id       TEXT UNIQUE,
  customer_id     UUID REFERENCES app.customers,
  lead_id         UUID REFERENCES app.leads,
  order_id        UUID REFERENCES app.orders,
  design_name     VARCHAR(255),
  artwork_type    VARCHAR(30),
  status          VARCHAR(30) DEFAULT 'draft',
  assigned_designer_id UUID REFERENCES app.agents,
  customer_approved BOOLEAN DEFAULT false,
  files           JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.design_tasks (
  design_task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id     UUID REFERENCES app.artwork ON DELETE CASCADE,
  conversation_id UUID REFERENCES app.conversations,
  title          VARCHAR(255),
  instructions   TEXT,
  priority       VARCHAR(20) DEFAULT 'Medium',
  status         VARCHAR(30) DEFAULT 'draft',
  assignee       VARCHAR(255),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.files (
  file_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  related_type VARCHAR(40),
  related_id   UUID,
  customer_id  UUID REFERENCES app.customers,
  name         VARCHAR(500),
  url          TEXT NOT NULL,
  file_type    VARCHAR(100),
  size_bytes   BIGINT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- Notes / Tasks / Activity ----------
CREATE TABLE IF NOT EXISTS app.notes (
  note_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id    TEXT UNIQUE,
  related_type VARCHAR(40) DEFAULT 'conversation',
  related_id   UUID,
  customer_id  UUID REFERENCES app.customers,
  title        VARCHAR(255),
  body         TEXT,
  category     VARCHAR(30) DEFAULT 'internal',
  author       VARCHAR(255),
  pinned       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.tasks (
  task_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  related_type VARCHAR(40),
  related_id   UUID,
  assigned_agent_id UUID REFERENCES app.agents,
  status       VARCHAR(20) DEFAULT 'open',
  priority     VARCHAR(20) DEFAULT 'medium',
  due_date     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type   VARCHAR(20),             -- agent, ai, system, customer
  actor_id     VARCHAR(120),
  action       VARCHAR(120) NOT NULL,
  related_type VARCHAR(40),
  related_id   UUID,
  meta         JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_activity ON app.activity_log(related_type, related_id, created_at DESC);

-- ---------- AI layer ----------
CREATE TABLE IF NOT EXISTS app.ai_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES app.conversations ON DELETE CASCADE,
  customer_id     UUID REFERENCES app.customers,
  signal_type     VARCHAR(50),          -- intent, sentiment, objection, buying_signal
  value           TEXT,
  confidence      NUMERIC(4,3),
  source_message_id UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.ai_chats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id  TEXT UNIQUE,
  agent_id   UUID REFERENCES app.agents,
  title      VARCHAR(255),
  messages   JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings (key/value) — same as current
CREATE TABLE IF NOT EXISTS app.settings (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW());

-- ============================================================
-- PHASE 2 "PERFECT DB" — Lead Intelligence + Analytics architecture
-- (from the ChatGPT.docx CRM blueprint, adapted: Postgres = structured,
--  Qdrant = unstructured vectors, Meta-native). All additive + idempotent.
-- Rule: filter/sort/group/chart/score => structured column.
--       human/AI paragraph text => *_summary / *_notes / *_analysis TEXT (also embedded in Qdrant).
-- ============================================================

-- ---------- A) Enrich EXISTING tables with the blueprint's fields ----------
-- LEADS: Meta-ad attribution, AI scores, geo + AI summaries (unstructured)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS source_platform      VARCHAR(40);   -- Facebook Ads, Instagram Ads, Organic, Website, Referral
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS campaign_id          VARCHAR(120);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS campaign_name        VARCHAR(255);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS adset_name           VARCHAR(255);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS ad_id                VARCHAR(120);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS intent_score         INT;           -- 0-100 buying intent
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS purchase_probability NUMERIC(5,2);  -- 0-100 %
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS temperature          VARCHAR(10);   -- hot/warm/cold
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS customer_type        VARCHAR(50);   -- print_shop, apparel_brand, church, school, sports_team, hobbyist...
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS industry             VARCHAR(60);   -- construction, roofing, church, gym, real_estate...
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS language             VARCHAR(20);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS country              VARCHAR(80);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS state                VARCHAR(80);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS city                 VARCHAR(100);
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS business_potential   VARCHAR(4);    -- A+, A, B, C, D
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS est_monthly_dtf_ft   INT;           -- estimated DTF consumption (feet/month)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS reseller_likelihood  INT;           -- 0-100
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS lead_summary         TEXT;          -- unstructured
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS profile_summary      TEXT;          -- unstructured (FB/IG profile read)
ALTER TABLE app.leads ADD COLUMN IF NOT EXISTS ai_observations      TEXT;          -- unstructured

-- CUSTOMERS: segmentation + lifetime metrics + AI summaries
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS customer_segment     VARCHAR(30);  -- one_time, repeat, reseller, wholesale, strategic
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS reseller_potential   INT;          -- 0-100
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS wholesale_potential  INT;          -- 0-100
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS lifetime_revenue     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS language             VARCHAR(20);
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS state                VARCHAR(80);
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS industry             VARCHAR(60);
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS customer_summary     TEXT;         -- unstructured
ALTER TABLE app.customers ADD COLUMN IF NOT EXISTS customer_preferences TEXT;         -- unstructured

-- CONVERSATIONS: response speed + sentiment + AI summaries + ad attribution
ALTER TABLE app.conversations ADD COLUMN IF NOT EXISTS response_time_sec     INT;
ALTER TABLE app.conversations ADD COLUMN IF NOT EXISTS sentiment_score       INT;     -- 0-100
ALTER TABLE app.conversations ADD COLUMN IF NOT EXISTS campaign_id           VARCHAR(120);
ALTER TABLE app.conversations ADD COLUMN IF NOT EXISTS ad_id                 VARCHAR(120);
ALTER TABLE app.conversations ADD COLUMN IF NOT EXISTS conversation_summary  TEXT;    -- unstructured
ALTER TABLE app.conversations ADD COLUMN IF NOT EXISTS conversation_insights TEXT;    -- unstructured

-- MESSAGES: AI content flags (for filtering/automation)
ALTER TABLE app.messages ADD COLUMN IF NOT EXISTS sentiment         VARCHAR(20);
ALTER TABLE app.messages ADD COLUMN IF NOT EXISTS contains_artwork  BOOLEAN DEFAULT false;
ALTER TABLE app.messages ADD COLUMN IF NOT EXISTS contains_zipcode  BOOLEAN DEFAULT false;
ALTER TABLE app.messages ADD COLUMN IF NOT EXISTS contains_quantity BOOLEAN DEFAULT false;
ALTER TABLE app.messages ADD COLUMN IF NOT EXISTS contains_deadline BOOLEAN DEFAULT false;
ALTER TABLE app.messages ADD COLUMN IF NOT EXISTS contains_price    BOOLEAN DEFAULT false;

-- ARTWORK: print-readiness analysis
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS width_pixels       INT;
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS height_pixels      INT;
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS dpi                INT;
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS file_type          VARCHAR(20);
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS resolution_grade   VARCHAR(2);   -- A/B/C/D
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS complexity_score   INT;
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS artwork_ready      BOOLEAN DEFAULT false;
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS risk_score         INT;
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS artwork_analysis   TEXT;         -- unstructured
ALTER TABLE app.artwork ADD COLUMN IF NOT EXISTS design_notes       TEXT;         -- unstructured

-- QUOTES: cost/margin economics + reasoning
ALTER TABLE app.quotes ADD COLUMN IF NOT EXISTS cost              NUMERIC(10,2);
ALTER TABLE app.quotes ADD COLUMN IF NOT EXISTS profit            NUMERIC(10,2);
ALTER TABLE app.quotes ADD COLUMN IF NOT EXISTS margin_pct        NUMERIC(5,2);
ALTER TABLE app.quotes ADD COLUMN IF NOT EXISTS shipping_cost     NUMERIC(10,2);
ALTER TABLE app.quotes ADD COLUMN IF NOT EXISTS quote_notes       TEXT;
ALTER TABLE app.quotes ADD COLUMN IF NOT EXISTS pricing_reasoning TEXT;

-- ORDERS: production partner + instructions
ALTER TABLE app.orders ADD COLUMN IF NOT EXISTS production_partner   VARCHAR(120);
ALTER TABLE app.orders ADD COLUMN IF NOT EXISTS order_summary        TEXT;
ALTER TABLE app.orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;

-- PAYMENTS: notes
ALTER TABLE app.payments ADD COLUMN IF NOT EXISTS payment_notes TEXT;
-- REQUIREMENTS: upsert key for the After-Session workflow
ALTER TABLE app.requirements ADD COLUMN IF NOT EXISTS legacy_id TEXT UNIQUE;

-- ---------- B) NEW tables (lead intelligence, sales, production, analytics) ----------
CREATE TABLE IF NOT EXISTS app.lead_stage_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID REFERENCES app.leads ON DELETE CASCADE,
  from_stage       VARCHAR(50),
  to_stage         VARCHAR(50),
  entered_at       TIMESTAMPTZ DEFAULT NOW(),
  exited_at        TIMESTAMPTZ,
  duration_minutes INT,
  changed_by       VARCHAR(120),
  transition_reason TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_lsh_lead ON app.lead_stage_history(lead_id, entered_at);

CREATE TABLE IF NOT EXISTS app.requirements (
  requirement_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID REFERENCES app.leads ON DELETE CASCADE,
  conversation_id  UUID REFERENCES app.conversations,
  product_type     VARCHAR(50),
  quantity         INT,
  sizes            JSONB,
  colors           JSONB,
  deadline         DATE,
  zipcode          VARCHAR(20),
  shipping_required BOOLEAN DEFAULT true,
  rush_order       BOOLEAN DEFAULT false,
  requirement_summary  TEXT,
  missing_information  TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.order_lines (
  line_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES app.orders ON DELETE CASCADE,
  sku         VARCHAR(60),
  product     VARCHAR(255),
  qty         INT,
  unit_price  NUMERIC(10,2),
  total       NUMERIC(10,2),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.artwork_qa (
  qa_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id       UUID REFERENCES app.artwork ON DELETE CASCADE,
  halo_detected    BOOLEAN DEFAULT false,
  jagged_edges     BOOLEAN DEFAULT false,
  low_resolution   BOOLEAN DEFAULT false,
  hidden_background BOOLEAN DEFAULT false,
  vector_available BOOLEAN DEFAULT false,
  qa_score         INT,
  qa_summary       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.quote_revisions (
  revision_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        UUID REFERENCES app.quotes ON DELETE CASCADE,
  revision_no     INT,
  old_price       NUMERIC(10,2),
  new_price       NUMERIC(10,2),
  discount_added  NUMERIC(10,2),
  revision_reason TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.negotiations (
  negotiation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          UUID REFERENCES app.quotes,
  lead_id           UUID REFERENCES app.leads,
  objection_type    VARCHAR(40),    -- price, shipping, turnaround, design_cost
  severity          VARCHAR(20),
  discount_requested NUMERIC(10,2),
  discount_given    NUMERIC(10,2),
  probability_to_buy NUMERIC(5,2),
  objection_summary TEXT,
  negotiation_notes TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.production_jobs (
  job_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES app.orders ON DELETE CASCADE,
  machine       VARCHAR(80),
  operator      VARCHAR(120),
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  status        VARCHAR(30) DEFAULT 'queued',
  efficiency    NUMERIC(5,2),
  waste_percent NUMERIC(5,2),
  production_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.production_qa (
  qa_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES app.production_jobs ON DELETE CASCADE,
  approved_qty  INT,
  rejected_qty  INT,
  qc_score      INT,
  rework_required BOOLEAN DEFAULT false,
  qc_notes      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.shipments (
  shipment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES app.orders ON DELETE CASCADE,
  customer_id   UUID REFERENCES app.customers,
  carrier       VARCHAR(30),
  tracking_no   VARCHAR(100),
  ship_date     TIMESTAMPTZ,
  delivery_date TIMESTAMPTZ,
  shipping_cost NUMERIC(10,2),
  status        VARCHAR(30),
  is_delayed    BOOLEAN DEFAULT false,
  shipping_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_ship_order ON app.shipments(order_id);

CREATE TABLE IF NOT EXISTS app.reviews (
  review_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES app.customers,
  order_id    UUID REFERENCES app.orders,
  rating      INT,
  platform    VARCHAR(40),
  review_date TIMESTAMPTZ,
  review_text TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.customer_health (
  customer_id           UUID PRIMARY KEY REFERENCES app.customers ON DELETE CASCADE,
  health_score          INT,
  clv                   NUMERIC(12,2),
  reorder_probability   NUMERIC(5,2),
  reorder_cycle_days    INT,
  churn_risk            INT,
  segment               VARCHAR(30),
  customer_analysis     TEXT,
  growth_recommendations TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.account_management (
  account_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID REFERENCES app.customers ON DELETE CASCADE,
  account_tier      VARCHAR(20),     -- standard, preferred, VIP, strategic
  monthly_spend     NUMERIC(12,2),
  reseller_status   VARCHAR(20),
  wholesale_status  VARCHAR(20),
  relationship_notes TEXT,
  growth_plan       TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- AI memory: every AI analysis/recommendation (also embedded in Qdrant via qdrant_point_id)
CREATE TABLE IF NOT EXISTS app.ai_insights (
  insight_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    VARCHAR(40),     -- lead, customer, conversation, order, artwork
  entity_id      VARCHAR(120),
  stage          VARCHAR(50),
  confidence     NUMERIC(5,2),
  insight_text   TEXT,
  recommendation TEXT,
  reasoning      TEXT,
  qdrant_point_id VARCHAR(80),
  generated_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_insights_entity ON app.ai_insights(entity_type, entity_id);

-- Analytics warehouse — daily KPI roll-up for dashboards/forecasting
CREATE TABLE IF NOT EXISTS app.kpi_facts (
  fact_date      DATE PRIMARY KEY,
  leads          INT DEFAULT 0,
  quotes         INT DEFAULT 0,
  orders         INT DEFAULT 0,
  revenue        NUMERIC(12,2) DEFAULT 0,
  profit         NUMERIC(12,2) DEFAULT 0,
  customers      INT DEFAULT 0,
  shipping_cost  NUMERIC(12,2) DEFAULT 0,
  marketing_cost NUMERIC(12,2) DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
