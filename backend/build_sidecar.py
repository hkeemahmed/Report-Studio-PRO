"""Build the desktop backend sidecar with PyInstaller and name it the way Tauri expects
(binaries/rsp-backend-<rust-target-triple>[.exe]).  Usage: python build_sidecar.py"""
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "apps" / "desktop" / "src-tauri" / "binaries"
sep = ";" if os.name == "nt" else ":"
args = [sys.executable, "-m", "PyInstaller", "--onefile", "--noconfirm", "--name", "rsp-backend", "-p", str(HERE),
        "--add-data", f"{HERE / 'app/exports/fonts'}{sep}app/exports/fonts",
        "--add-data", f"{HERE.parent / 'packages/template-engine/templates.json'}{sep}packages/template-engine",
        "--add-data", f"{HERE / 'migrations'}{sep}migrations", "--collect-submodules", "app",
        "--hidden-import", "uvicorn.logging", "--hidden-import", "uvicorn.loops.auto", "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.lifespan.on", "--collect-all", "docx", "--collect-all", "reportlab", "--collect-data", "latex2mathml",
        "--collect-data", "arabic_reshaper", "--collect-all", "pypdfium2", "--collect-all", "pypdfium2_raw",
        "--distpath", str(HERE / "dist"), "--workpath", str(HERE / "build"), str(HERE / "desktop_entry.py")]
subprocess.run(args, check=True)
triple = subprocess.run(["rustc", "-vV"], capture_output=True, text=True).stdout.split("host: ")[1].split()[0] \
    if shutil.which("rustc") else {"Windows": "x86_64-pc-windows-msvc", "Linux": "x86_64-unknown-linux-gnu"}[platform.system()]
OUT.mkdir(parents=True, exist_ok=True)
ext = ".exe" if os.name == "nt" else ""
shutil.copy2(HERE / "dist" / f"rsp-backend{ext}", OUT / f"rsp-backend-{triple}{ext}")
print("sidecar ->", OUT / f"rsp-backend-{triple}{ext}")
