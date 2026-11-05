# Architecture

Modular monolith. Modules are separated so they can become independent services later.

```
apps/web            React + TypeScript + Tailwind UI (Dashboard, Wizard, Editor, Projects, Templates, References, Sources, Settings)
apps/desktop        Tauri 2 shell + bundled local backend sidecar (offline)
packages/
  editor-core       Tiptap/ProseMirror extensions: report nodes, formatting, find/replace, track changes, comments, page layout engine, charts
  document-schema   Shared layout model (page size, margins, header/footer…), markdown→nodes, direction detection
  template-engine   12 built-in templates (single JSON source used by backend + frontend) and document builder
  shared-types      API/domain types        ui-components   Design system (buttons, inputs, dialogs, tabs, toasts…)
backend/app
  api/              REST routers (54 endpoints, OpenAPI at /docs)
  auth/             Argon2id, JWT access + refresh (revocable via token_version), RBAC (owner/admin/editor/viewer), AES-GCM secrets
  models/           22 SQLAlchemy tables (UUID, FKs, indexes, JSONB on PostgreSQL)
  documents/        content validation, sections, DOCX import
  exports/          dedicated engines: DOCX (python-docx + raw OOXML), PDF (ReportLab + custom bidi/Arabic shaping), HTML/MD/TXT
  ai/               provider adapters (OpenAI/compatible, Ollama, Anthropic), prompts, RAG (extract→chunk→embed→retrieve→verified citations)
  references/       APA 7, IEEE, MLA, Chicago, Harvard, Vancouver; BibTeX/RIS import; DOI/ISBN validation
  sync/ (api/sync)  push/pull with base-version checks, idempotent ops, conflict reports with diff
backend/migrations  0001 core schema, 0002 full-text search (tsvector GIN), 0003 pgvector (optional)
```

Key decisions:
- **Content is separate from layout.** The document is ProseMirror JSON. Page settings live in `documents.layout`. The editor's page engine (`pagination.ts`) measures blocks and draws page furniture as decorations, so it never changes the content. Exports are rendered server-side from the same JSON and layout.
- **Arabic in PDF:** ReportLab has no OpenType shaping, so `exports/bidi.py` breaks lines in logical order, then reorders each line at word level (UAX#9 subset: RTL/LTR runs, numbers, mirrored brackets) and shapes the Arabic with `arabic_reshaper`. Amiri (OFL) is embedded.
- **No silent overwrites:** every write carries `base_version`. A mismatch returns 409, or a sync `conflict` with the server copy and a diff. The user picks "keep mine", "keep server" or "keep both".
- **API keys** only live on the backend, encrypted with AES-256-GCM. The client only ever sees `has_api_key`.
