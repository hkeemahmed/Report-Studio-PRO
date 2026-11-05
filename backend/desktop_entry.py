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


def _alive(pid: int) -> bool:
    if os.name == "nt":
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(h)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _watch_parent():
    """Exit when the desktop app is gone, so no orphan server keeps running after it closes or crashes."""
    import threading
    import time
    pid = int(os.environ.get("RSP_PARENT_PID", "0") or 0)
    if not pid:
        return

    def loop():
        while _alive(pid):
            time.sleep(1.5)
        os._exit(0)
    threading.Thread(target=loop, daemon=True).start()


_watch_parent()

import uvicorn  # noqa: E402
from app.migrate import run  # noqa: E402

run()
from app.main import app  # noqa: E402  (import object: string import doesn't work in a frozen build)

uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("RSP_PORT", "8765")), log_level="warning")
