-- Artwork de-duplication portal — migration inventory + human keep/remove decisions.
BEGIN;
CREATE TABLE IF NOT EXISTS app.migration_dedup_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer      varchar NOT NULL,
  drive_path    text,
  file_name     varchar,
  sha256        varchar,
  drive_file_id varchar,
  file_size     bigint,
  asset_type    varchar,
  dup_group     varchar,          -- files sharing this = exact duplicates (sha256)
  thumb_b64     text,             -- small preview (data URI body), generated for dup-group files
  decision      varchar,          -- NULL | 'keep' | 'remove'
  decided_by    varchar,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dedup_customer ON app.migration_dedup_files(customer);
CREATE INDEX IF NOT EXISTS idx_dedup_group    ON app.migration_dedup_files(dup_group);
CREATE INDEX IF NOT EXISTS idx_dedup_sha      ON app.migration_dedup_files(sha256);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.migration_dedup_files TO decoinks;
GRANT SELECT ON app.migration_dedup_files TO bi_readonly;
COMMIT;
