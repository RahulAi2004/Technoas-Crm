-- ============================================================
-- FILE-MANAGEMENT SYSTEM — 2026-07-16
-- • customers.folder      = YYMMDD_Firstname_Lastname  (YYMMDD = customer ka PEHLA message)
--                           stable + unique per customer, kabhi change nahi
-- • customer_artwork.nextcloud_url / gdrive_url / upload_status  (2 shareable links + retry state)
-- NON-DESTRUCTIVE: ADD IF NOT EXISTS only.
-- ============================================================

ALTER TABLE app.customers        ADD COLUMN IF NOT EXISTS folder        VARCHAR(200);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_folder ON app.customers(folder);

ALTER TABLE app.customer_artwork ADD COLUMN IF NOT EXISTS nextcloud_url TEXT;
ALTER TABLE app.customer_artwork ADD COLUMN IF NOT EXISTS gdrive_url    TEXT;
ALTER TABLE app.customer_artwork ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) DEFAULT 'pending';
CREATE INDEX IF NOT EXISTS idx_ca_upload_status ON app.customer_artwork(upload_status);
