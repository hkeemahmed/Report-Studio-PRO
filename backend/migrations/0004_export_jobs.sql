-- 0004_export_jobs.sql — background export jobs (Celery) keep their output in storage.
ALTER TABLE exports ADD COLUMN IF NOT EXISTS storage_key VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE exports ADD COLUMN IF NOT EXISTS error TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS ix_exports_document ON exports(document_id, created_at);
