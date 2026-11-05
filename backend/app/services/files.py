"""File validation by magic bytes (never trust the client's Content-Type or extension)."""
import zipfile
import io

SIGNATURES = [
    (b"\x89PNG\r\n\x1a\n", "image/png"), (b"\xff\xd8\xff", "image/jpeg"), (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"), (b"%PDF-", "application/pdf"),
]
IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
SOURCE_TYPES = {"application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


def sniff(data: bytes, filename: str) -> str | None:
    for sig, mime in SIGNATURES:
        if data.startswith(sig):
            return mime
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                if "word/document.xml" in z.namelist():
                    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        except zipfile.BadZipFile:
            return None
        return None
    if filename.lower().endswith((".txt", ".md", ".bib", ".ris")):
        try:
            data[:65536].decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            return None
    return None
