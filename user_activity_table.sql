-- Admin panel audit log: user activity (login / logout / message_sent / ...)
-- Written directly (not via the in-memory model) by server/index.js logActivity().
CREATE TABLE IF NOT EXISTS app.user_activity (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text,
  user_name        text,
  action           text NOT NULL,          -- 'login' | 'logout' | 'message_sent'
  conversation_ref text,                    -- in-memory/legacy conversation id (text, not FK)
  customer_name    text,                    -- who the message went to
  detail           jsonb,                   -- { preview, via, ... }
  ip               text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ua_user    ON app.user_activity(user_name);
CREATE INDEX IF NOT EXISTS idx_ua_action  ON app.user_activity(action);
CREATE INDEX IF NOT EXISTS idx_ua_created ON app.user_activity(created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.user_activity TO decoinks;
