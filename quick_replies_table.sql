-- Instant Replies (quick / canned responses) for the AI Supervisor "Instant Replies" tab.
-- Seeded from the most-repeated agent replies across past chats; editable + add via the UI.
CREATE TABLE IF NOT EXISTS app.quick_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text,
  body        text NOT NULL,
  category    text,
  sort        int DEFAULT 0,
  usage_count int DEFAULT 0,
  source      text DEFAULT 'manual',   -- 'manual' | 'suggested'
  active      boolean DEFAULT true,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qr_active ON app.quick_replies(active, sort);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.quick_replies TO decoinks;
