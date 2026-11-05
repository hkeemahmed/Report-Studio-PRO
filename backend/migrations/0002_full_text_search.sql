-- 0002_full_text_search.sql — PostgreSQL full text search over documents (Arabic + English).
-- 'simple' config avoids language-specific stemming so mixed Arabic/English text is indexed uniformly.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                         setweight(to_tsvector('simple', coalesce(plain_text, '')), 'B')) STORED;
CREATE INDEX IF NOT EXISTS ix_documents_search ON documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS ix_documents_metadata ON documents USING GIN (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ix_sources_title_fts ON bibliographic_sources USING GIN (to_tsvector('simple', title));
