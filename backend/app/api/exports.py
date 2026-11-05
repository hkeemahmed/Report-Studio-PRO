import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..api.references import as_dict
from ..auth.deps import current_user, get_document_checked
from ..db import get_db
from ..documents.schema import SchemaError, collect
from ..exports.context import ExportContext
from ..exports.docx_export import export_docx
from ..exports.pdf_export import export_pdf
from ..exports.text_export import export_html, export_markdown, export_txt
from ..models import BibliographicSource, Document, Export, User
from ..schemas import ExportIn
from ..services.documents import check_content

router = APIRouter(prefix="/exports", tags=["exports"])

FORMATS = {
    "pdf": ("application/pdf", export_pdf, "pdf"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", export_docx, "docx"),
    "html": ("text/html; charset=utf-8", export_html, "html"),
    "md": ("text/markdown; charset=utf-8", export_markdown, "md"),
    "txt": ("text/plain; charset=utf-8", export_txt, "txt"),
}


def build_context(db: Session, d: Document, content=None, layout=None) -> ExportContext:
    content = content or d.content
    srcs = {}
    for c in collect(content, "citation"):
        sid = (c.get("attrs") or {}).get("sourceId")
        try:
            s = db.get(BibliographicSource, uuid.UUID(str(sid)))
        except ValueError:
            continue
        if s and s.workspace_id == d.workspace_id:
            srcs[str(s.id)] = as_dict(s)
    meta = {**(d.metadata_ or {}), "title": d.title}
    return ExportContext(d.title, content, layout or d.layout, d.language, meta, srcs)


def safe_filename(title: str, ext: str) -> str:
    base = re.sub(r"[^\w؀-ۿ -]+", "", title).strip()[:80] or "report"
    return f"{base}.{ext}"


@router.post("/{fmt}")
def export(fmt: str, body: ExportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if fmt not in FORMATS:
        raise HTTPException(404, f"Unsupported export format: {fmt}")
    d = get_document_checked(db, user, body.document_id)
    check_content(body.content, body.layout)
    mime, fn, ext = FORMATS[fmt]
    try:
        ctx = build_context(db, d, body.content, body.layout)
        out = fn(ctx)
    except SchemaError as e:
        raise HTTPException(422, str(e))
    data = out.encode("utf-8") if isinstance(out, str) else out
    db.add(Export(document_id=d.id, user_id=user.id, format=fmt, document_version=d.version, size_bytes=len(data)))
    db.commit()
    from urllib.parse import quote
    name = safe_filename(d.title, ext)
    return Response(data, media_type=mime, headers={
        "Content-Disposition": f"attachment; filename=\"report.{ext}\"; filename*=UTF-8''{quote(name)}"})
