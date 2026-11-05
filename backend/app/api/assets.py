import hashlib
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..ai.rag import SUPPORTED, chunk_pages, extract_text
from ..auth.deps import current_user, get_document_checked, log_activity, require_role
from ..config import get_settings
from ..db import get_db
from ..models import Asset, User
from ..services.files import IMAGE_TYPES, SOURCE_TYPES, sniff
from ..services.storage import get_storage
from .common import resolve_workspace

router = APIRouter(prefix="/assets", tags=["assets"])


def _out(a: Asset) -> dict:
    return {"id": a.id, "kind": a.kind, "filename": a.filename, "mime_type": a.mime_type, "size_bytes": a.size_bytes,
            "document_id": a.document_id, "created_at": a.created_at, "indexed": bool(a.chunks),
            "chunk_count": len(a.chunks or []), "embedded": bool(a.chunks and a.chunks[0].get("embedding")),
            "text_chars": len(a.extracted_text or "")}


@router.post("", status_code=201)
async def upload(file: UploadFile = File(...), kind: str = Form("image"), workspace_id: uuid.UUID | None = Form(None),
                 document_id: uuid.UUID | None = Form(None), user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id, "editor")
    if document_id:
        d = get_document_checked(db, user, document_id, "editor")
        if d.workspace_id != ws.id:
            raise HTTPException(400, "Document not in workspace")
    limit = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File exceeds {get_settings().max_upload_mb} MB")
    if not data:
        raise HTTPException(400, "Empty file")
    name = (file.filename or "upload").replace("\\", "/").split("/")[-1][:300]
    mime = sniff(data, name)
    allowed = IMAGE_TYPES if kind == "image" else SOURCE_TYPES
    if kind not in ("image", "source") or mime not in allowed:
        raise HTTPException(415, f"Unsupported or invalid file for kind '{kind}'")
    sha = hashlib.sha256(data).hexdigest()
    aid = uuid.uuid4()
    key = f"{ws.id}/{aid}"
    get_storage().put(key, data)
    a = Asset(id=aid, workspace_id=ws.id, document_id=document_id, kind=kind, filename=name, mime_type=mime,
              size_bytes=len(data), sha256=sha, storage_key=key, uploaded_by=user.id)
    if kind == "source":
        try:
            pages = extract_text(data, SUPPORTED[mime])
        except Exception as e:
            get_storage().delete(key)
            raise HTTPException(422, f"Could not read file: {e.__class__.__name__}")
        a.extracted_text = "\n\n".join(t for _, t in pages)[:2_000_000]
        a.chunks = chunk_pages(pages)
    db.add(a)
    log_activity(db, user, "asset.upload", ws.id, "asset", aid, {"filename": name, "kind": kind})
    db.commit()
    return _out(a)


@router.get("")
def list_assets(workspace_id: uuid.UUID | None = None, kind: str = "", document_id: uuid.UUID | None = None,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    q = db.query(Asset).filter_by(workspace_id=ws.id)
    if kind:
        q = q.filter_by(kind=kind)
    if document_id:
        q = q.filter_by(document_id=document_id)
    return [_out(a) for a in q.order_by(Asset.created_at.desc()).limit(500)]


def _get(db, user, aid, role="viewer") -> Asset:
    a = db.get(Asset, aid)
    if not a:
        raise HTTPException(404, "Asset not found")
    require_role(db, user, a.workspace_id, role)
    return a


@router.get("/{aid}/content")
def content(aid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _get(db, user, aid)
    return Response(get_storage().get(a.storage_key), media_type=a.mime_type,
                    headers={"Content-Disposition": f'inline; filename="{a.filename.encode("ascii", "ignore").decode() or "file"}"',
                             "X-Content-Type-Options": "nosniff"})


@router.get("/{aid}/text")
def text(aid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _get(db, user, aid)
    return {"id": a.id, "filename": a.filename, "text": a.extracted_text}


@router.delete("/{aid}", status_code=204)
def delete(aid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _get(db, user, aid, "editor")
    get_storage().delete(a.storage_key)
    db.delete(a)
    db.commit()
