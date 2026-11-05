# Implementation status (verified by tests)

| Area | Status |
|---|---|
| Auth (Argon2id, JWT + refresh, revoke all, rate limiting, security headers), RBAC + workspace isolation | Done, tested |
| 22-table schema + PostgreSQL migrations (FTS, optional pgvector) | Done, tested on SQLite and PostgreSQL 16 |
| Dashboard, Projects (folders, archive, favourites, search), Reports list (filters, tags), 6-step wizard | Done |
| Editor: ribbon (File/Home/Insert/Layout/References/Review/View), real paginated pages, header/footer/page numbers, ruler with draggable margins, navigation, zoom, full screen, shortcuts, autosave, version history/restore/compare | Done, E2E tested |
| Tables (merge/split, colours, borders, captions), images (upload, resize, align, crop, caption), shapes, charts (bar/line/pie/scatter), KaTeX equations, links, footnotes | Done |
| TOC, bibliography, figure list and table list (live), citations in 6 styles, BibTeX/RIS import | Done, tested |
| Review: spell check (browser), AI grammar, rule-based quality checks, comments, track changes, document compare | Done |
| Export: PDF, DOCX, HTML, Markdown, TXT; print preview | Done, content verified |
| AI: writer/editor/research/analysis, context menu, preview before applying, provider management/test/limits/usage, RAG with citation verification | Done (tested against a mocked provider API; real providers need your key or Ollama) |
| Offline: local IndexedDB queue + sync engine with conflict resolution | Done, unit and API tested |
| Templates: 12 categories + Template Designer | Done |

## Known limitations (stated honestly)
- **Windows installer:** the Tauri config, sidecar entry point and build scripts are included. The installer itself was **not built or tested**, because building it needs Windows plus the Rust/WebView2 toolchain.
- **Equations** export to DOCX/PDF as LaTeX text, not native Word math (OMML).
- **Footnotes and endnotes** are numbered automatically but collected in a "Notes" section at the end, not placed at the bottom of each page.
- **Editor pagination:** a single block taller than a page (e.g. a very long table) overflows in the editor view. The PDF and DOCX engines split it correctly. Multi-column layouts show as a continuous view in the editor.
- **"Multiple pages" view** is a zoomed-out vertical overview, not side-by-side pages.
- **Rate limiting** is per process. Use Redis when running several instances. Celery/Redis background jobs are not wired yet: exports are synchronous.
- **Plagiarism detection** is deliberately not offered, because it needs a dedicated service and a comparison corpus.
- **ODT export** is not implemented (it was optional).
