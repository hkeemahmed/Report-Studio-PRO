import io
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
from ..exports.odt_export import export_odt
from ..exports.pdf_export import export_pdf
from ..exports.text_export import export_html, export_markdown, export_txt
from ..models import BibliographicSource, Document, Export, User
from ..schemas import ExportIn
from ..services.documents import check_content

router = APIRouter(prefix="/exports", tags=["exports"])

FORMATS = {
    "pdf": ("application/pdf", export_pdf, "pdf"),
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", export_docx, "docx"),
    "odt": ("application/vnd.oasis.opendocument.text", export_odt, "odt"),
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


@router.post("/pages")
def page_images(body: ExportIn, scale: float = 0.6, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Render the document's real output pages to PNG thumbnails (multi-page view / print overview)."""
    import base64
    import pypdfium2 as pdfium
    d = get_document_checked(db, user, body.document_id)
    check_content(body.content, body.layout)
    pdf_bytes = export_pdf(build_context(db, d, body.content, body.layout))
    pdf = pdfium.PdfDocument(pdf_bytes)
    scale = max(0.2, min(scale, 1.5))
    pages = []
    for i in range(min(len(pdf), 200)):
        img = pdf[i].render(scale=scale).to_pil()
        buf = io.BytesIO()
        img.save(buf, "PNG", optimize=True)
        pages.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
    return {"count": len(pdf), "pages": pages}


@router.post("/jobs", status_code=202)
def create_job(body: ExportIn, fmt: str = "pdf", user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Queue an export in the background (Celery). Poll GET /exports/jobs/{id}, then download /file."""
    from ..jobs import render_export
    if fmt not in FORMATS:
        raise HTTPException(404, f"Unsupported export format: {fmt}")
    d = get_document_checked(db, user, body.document_id)
    check_content(body.content, body.layout)
    ex = Export(document_id=d.id, user_id=user.id, format=fmt, document_version=d.version, status="queued")
    db.add(ex)
    db.commit()
    render_export.delay(str(ex.id), body.content, body.layout)
    db.refresh(ex)
    return {"job_id": str(ex.id), "status": ex.status}


def _job(db, user, job_id):
    ex = db.get(Export, job_id)
    if not ex:
        raise HTTPException(404, "Job not found")
    get_document_checked(db, user, ex.document_id)
    return ex


@router.get("/jobs/{job_id}")
def job_status(job_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ex = _job(db, user, job_id)
    return {"job_id": str(ex.id), "status": ex.status, "format": ex.format, "size_bytes": ex.size_bytes, "error": ex.error}


@router.get("/jobs/{job_id}/file")
def job_file(job_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from urllib.parse import quote
    from ..services.storage import get_storage
    ex = _job(db, user, job_id)
    if ex.status != "done":
        raise HTTPException(409, f"Job is {ex.status}")
    d = db.get(Document, ex.document_id)
    mime, _, ext = FORMATS[ex.format]
    return Response(get_storage().get(ex.storage_key), media_type=mime, headers={
        "Content-Disposition": f"attachment; filename=\"report.{ext}\"; filename*=UTF-8''{quote(safe_filename(d.title, ext))}"})


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
