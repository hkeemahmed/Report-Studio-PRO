-- 0003_pgvector.sql — OPTIONAL: vector search for RAG. Requires the pgvector extension
-- (included in the docker image pgvector/pgvector:pg16). The migration runner skips this file
-- with a warning when the extension is not available; RAG then uses in-process cosine search.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS asset_chunks (
    id UUID PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    page INTEGER NOT NULL DEFAULT 1,
    text TEXT NOT NULL,
    embedding vector,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_asset_chunks_asset ON asset_chunks(asset_id);
CREATE INDEX IF NOT EXISTS ix_asset_chunks_ws ON asset_chunks(workspace_id);
