-- Decoinks CRM — AI/analysis extension tables (10). Extends frozen app.messages / app.conversations.
-- Idempotent (IF NOT EXISTS). Run as postgres, then GRANT to decoinks.
BEGIN;
SET search_path = app, public;

-- 1. message_ai_annotations
CREATE TABLE IF NOT EXISTS app.message_ai_annotations (
  annotation_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id              uuid NOT NULL REFERENCES app.messages(message_id) ON DELETE CASCADE,
  conversation_id         uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id             uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  lead_id                 uuid REFERENCES app.leads(lead_id) ON DELETE SET NULL,
  primary_intent          varchar,
  secondary_intent        varchar,
  purchase_intent         varchar,
  purchase_intent_score   integer,
  sentiment               varchar,
  urgency                 varchar,
  objection_type          varchar,
  action_required         boolean,
  recommended_action      varchar,
  recommended_response_strategy varchar,
  ai_summary              text,
  ai_confidence           numeric,
  model_version           varchar,
  prompt_version          varchar,
  order_no                text,          -- tag this message to a customer order (AI Mapping)
  human_edits             jsonb,         -- reviewer/boss edits kept separately from the AI prediction
  edited_by               text,
  edited_at               timestamptz,
  processed_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- 2. message_entities
CREATE TABLE IF NOT EXISTS app.message_entities (
  entity_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES app.messages(message_id) ON DELETE CASCADE,
  conversation_id  uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  entity_type      varchar,
  entity_value     text,
  normalized_value text,
  numeric_value    numeric,
  currency         varchar,
  confidence       numeric,
  source_text      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. message_commercial_signals
CREATE TABLE IF NOT EXISTS app.message_commercial_signals (
  signal_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          uuid NOT NULL REFERENCES app.messages(message_id) ON DELETE CASCADE,
  conversation_id     uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id         uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  lead_id             uuid REFERENCES app.leads(lead_id) ON DELETE SET NULL,
  signal_type         varchar,
  amount              numeric,
  currency            varchar,
  quantity            integer,
  payment_method      varchar,
  confidence          numeric,
  is_confirmed        boolean DEFAULT false,
  confirmation_source varchar,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 4. message_state_changes
CREATE TABLE IF NOT EXISTS app.message_state_changes (
  change_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES app.messages(message_id) ON DELETE CASCADE,
  conversation_id  uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  lead_id          uuid REFERENCES app.leads(lead_id) ON DELETE SET NULL,
  state_type       varchar,
  value_before     varchar,
  value_after      varchar,
  change_detected  boolean,
  confidence       numeric,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 5. message_qualification_changes
CREATE TABLE IF NOT EXISTS app.message_qualification_changes (
  qualification_change_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES app.messages(message_id) ON DELETE CASCADE,
  conversation_id  uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  lead_id          uuid REFERENCES app.leads(lead_id) ON DELETE SET NULL,
  qualification_field varchar,
  old_value        text,
  new_value        text,
  score_delta      numeric,
  confidence       numeric,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 7. conversation_state (one row per conversation)
CREATE TABLE IF NOT EXISTS app.conversation_state (
  conversation_id        uuid PRIMARY KEY REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id            uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  lead_id                uuid REFERENCES app.leads(lead_id) ON DELETE SET NULL,
  current_stage          varchar,
  previous_stage         varchar,
  purchase_intent        varchar,
  purchase_intent_score  integer,
  qualification_score    integer,
  payment_state          varchar,
  latest_amount          numeric,
  latest_payment_method  varchar,
  primary_product        varchar,
  quantity               integer,
  artwork_status         varchar,
  customer_sentiment     varchar,
  urgency                varchar,
  next_best_action       varchar,
  last_analyzed_message_id uuid,
  last_analyzed_at       timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- 8. conversation_ai_analysis
CREATE TABLE IF NOT EXISTS app.conversation_ai_analysis (
  analysis_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id        uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  lead_id            uuid REFERENCES app.leads(lead_id) ON DELETE SET NULL,
  conversation_summary text,
  requirements_summary text,
  commercial_summary text,
  payment_summary    text,
  artwork_summary    text,
  customer_profile   text,
  objections_summary text,
  buying_signals     jsonb,
  risk_signals       jsonb,
  recommended_next_action text,
  recommended_response_strategy text,
  model_version      varchar,
  generated_at       timestamptz NOT NULL DEFAULT now()
);

-- 9. conversation_entities
CREATE TABLE IF NOT EXISTS app.conversation_entities (
  conversation_entity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid REFERENCES app.conversations(conversation_id) ON DELETE CASCADE,
  customer_id       uuid REFERENCES app.customers(customer_id) ON DELETE SET NULL,
  entity_type       varchar,
  entity_value      text,
  normalized_value  text,
  source_message_id uuid,
  confidence        numeric,
  is_current        boolean DEFAULT true,
  valid_from        timestamptz,
  valid_to          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 10. training_batches (created before message_training_feedback for its FK)
CREATE TABLE IF NOT EXISTS app.training_batches (
  training_batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name        varchar,
  training_type     varchar,
  description       text,
  message_count     integer DEFAULT 0,
  reviewed_count    integer DEFAULT 0,
  accepted_count    integer DEFAULT 0,
  corrected_count   integer DEFAULT 0,
  skipped_count     integer DEFAULT 0,
  accuracy_score    numeric,
  model_version     varchar,
  prompt_version    varchar,
  status            varchar DEFAULT 'active',
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 6. message_training_feedback (FKs to annotations + training_batches)
CREATE TABLE IF NOT EXISTS app.message_training_feedback (
  feedback_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid NOT NULL REFERENCES app.messages(message_id) ON DELETE CASCADE,
  annotation_id     uuid REFERENCES app.message_ai_annotations(annotation_id) ON DELETE SET NULL,
  training_batch_id uuid REFERENCES app.training_batches(training_batch_id) ON DELETE SET NULL,
  ai_output         jsonb,
  human_output      jsonb,
  validation_status varchar,
  error_type        varchar,
  correction_reason text,
  reviewed_by       varchar,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes (lookup by message / conversation / customer)
CREATE INDEX IF NOT EXISTS idx_ai_ann_msg   ON app.message_ai_annotations(message_id);
CREATE INDEX IF NOT EXISTS idx_ai_ann_conv  ON app.message_ai_annotations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_ann_cust  ON app.message_ai_annotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_ent_msg      ON app.message_entities(message_id);
CREATE INDEX IF NOT EXISTS idx_ent_conv     ON app.message_entities(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sig_msg      ON app.message_commercial_signals(message_id);
CREATE INDEX IF NOT EXISTS idx_sig_conv     ON app.message_commercial_signals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_stc_msg      ON app.message_state_changes(message_id);
CREATE INDEX IF NOT EXISTS idx_stc_conv     ON app.message_state_changes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_qual_msg     ON app.message_qualification_changes(message_id);
CREATE INDEX IF NOT EXISTS idx_qual_conv    ON app.message_qualification_changes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tf_msg       ON app.message_training_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_tf_batch     ON app.message_training_feedback(training_batch_id);
CREATE INDEX IF NOT EXISTS idx_convai_conv  ON app.conversation_ai_analysis(conversation_id);
CREATE INDEX IF NOT EXISTS idx_convent_conv ON app.conversation_entities(conversation_id);
CREATE INDEX IF NOT EXISTS idx_convstate_cust ON app.conversation_state(customer_id);

-- App user DML grants
GRANT SELECT, INSERT, UPDATE, DELETE ON
  app.message_ai_annotations, app.message_entities, app.message_commercial_signals,
  app.message_state_changes, app.message_qualification_changes, app.message_training_feedback,
  app.conversation_state, app.conversation_ai_analysis, app.conversation_entities, app.training_batches
TO decoinks;
GRANT SELECT ON
  app.message_ai_annotations, app.message_entities, app.message_commercial_signals,
  app.message_state_changes, app.message_qualification_changes, app.message_training_feedback,
  app.conversation_state, app.conversation_ai_analysis, app.conversation_entities, app.training_batches
TO bi_readonly;

COMMIT;
