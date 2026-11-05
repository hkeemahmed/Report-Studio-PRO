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
| Export: PDF, DOCX, **ODT**, HTML, Markdown, TXT; print preview | Done, content verified (DOCX/ODT also opened in LibreOffice) |
| Native Word equations (OMML) and real footnotes at page bottom (DOCX, ODT, PDF) | Done, tested |
| Background export jobs (Celery + Redis; in-process fallback) and Redis-shared rate limiting | Done, verified with a real worker + Redis |
| Multiple Pages view (side by side, rendered from the real output) | Done, E2E tested |
| Similarity check vs. your uploaded sources and workspace reports | Done, tested |
| Desktop app (Tauri): bundled offline backend, closes cleanly | Built and launched on Linux; Windows installer built by CI workflow |
| AI: writer/editor/research/analysis, context menu, preview before applying, provider management/test/limits/usage, RAG with citation verification | Done (tested against a mocked provider API; real providers need your key or Ollama) |
| Offline: local IndexedDB queue + sync engine with conflict resolution | Done, unit and API tested |
| Templates: 12 categories + Template Designer | Done |

## Remaining limitations (stated honestly)
- **Windows installer**: `.github/workflows/desktop-windows.yml` builds the NSIS `.exe` and MSI on a Windows runner.
  The same pipeline was built and run here on Linux (.deb). Pushing the repo to GitHub and running that workflow produces the installer.
  I could not run the Windows build itself in this environment.
- **Word equations** are generated as standard OMML. LibreOffice's Math module couldn't be installed here, so their *rendering* wasn't visually checked.
- **Internet plagiarism detection** is not offered. The similarity check compares only with your own sources and reports; a web check needs an external service.
- **Editor view:** a single block taller than one page overflows in the editor (the PDF/DOCX engines split it properly). Multi-column layouts show as a continuous view.
