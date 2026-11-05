"""Entry point bundled into the Windows desktop app (PyInstaller). Local-only: binds to 127.0.0.1.
A persistent per-install JWT/secrets key is created on first run (never shipped inside the app)."""
import os
import secrets
from pathlib import Path

store = Path(os.environ.get("RSP_STORAGE_DIR", Path.home() / ".reportstudio")); store.mkdir(parents=True, exist_ok=True)
key = store / "secret.key"
if not key.exists():
    key.write_text(secrets.token_hex(32))
os.environ.setdefault("RSP_JWT_SECRET", key.read_text().strip())

import uvicorn  # noqa: E402
from app.migrate import run  # noqa: E402

run()
uvicorn.run("app.main:app", host="127.0.0.1", port=8765)
