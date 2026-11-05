import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from ..auth.deps import current_user, get_document_checked, log_activity, require_role
from ..db import get_db
from ..documents.schema import DEFAULT_LAYOUT, empty_doc
from ..models import Comment, Document, DocumentSection, DocumentTag, DocumentVersion, Project, Tag, Template, User
from ..schemas import (CommentIn, CommentOut, DocumentIn, DocumentOut, DocumentSummary, DocumentUpdate, TagsIn,
                       VersionDetail, VersionOut)
from ..services.diff import compare_docs
from ..services.documents import apply_update, check_content, refresh_derived, snapshot
from .common import doc_to_out, resolve_workspace

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentSummary])
def list_documents(workspace_id: uuid.UUID | None = None, project_id: uuid.UUID | None = None,
                   folder_id: uuid.UUID | None = None, q: str = Query("", max_length=200), status: str = "",
                   favorite: bool | None = None, tag: str = "", limit: int = Query(100, le=500), offset: int = 0,
                   user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    qry = db.query(Document).filter(Document.workspace_id == ws.id)
    if project_id:
        qry = qry.filter(Document.project_id == project_id)
    if folder_id:
        qry = qry.filter(Document.folder_id == folder_id)
    if status:
        qry = qry.filter(Document.status == status)
    if favorite is not None:
        qry = qry.filter(Document.is_favorite == favorite)
    if tag:
        qry = qry.join(DocumentTag, DocumentTag.document_id == Document.id).join(Tag, Tag.id == DocumentTag.tag_id)\
            .filter(Tag.name == tag)
    if q:
        # Portable search; on PostgreSQL the migration adds a GIN tsvector index used by /search.
        like = f"%{q}%"
        if db.bind.dialect.name == "postgresql":
            fts = text("documents.search_vector @@ plainto_tsquery('simple', :q)").bindparams(q=q)
            qry = qry.filter(or_(fts, Document.title.ilike(like), Document.plain_text.ilike(like)))
        else:
            qry = qry.filter(or_(Document.title.ilike(like), Document.plain_text.ilike(like)))
    docs = qry.order_by(Document.updated_at.desc()).offset(offset).limit(limit).all()
    return [doc_to_out(db, d, full=False) for d in docs]


@router.post("", response_model=DocumentOut, status_code=201)
def create_document(body: DocumentIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    if body.project_id:
        p = db.get(Project, body.project_id)
        if not p or p.workspace_id != ws.id:
            raise HTTPException(400, "Project not in workspace")
    tpl = None
    if body.template_id:
        tpl = db.get(Template, body.template_id)
    elif body.template_slug:
        tpl = db.query(Template).filter_by(slug=body.template_slug, is_builtin=True).first()
    if tpl and tpl.workspace_id not in (None, ws.id):
        raise HTTPException(400, "Template not available")
    layout = {**DEFAULT_LAYOUT, **(tpl.layout if tpl else {}), **(body.layout or {}),
              "direction": "rtl" if body.language == "ar" else "ltr"}
    content = body.content or empty_doc()
    check_content(content, layout)
    if body.id and db.get(Document, body.id):
        raise HTTPException(409, "Document id already exists")
    d = Document(id=body.id or uuid.uuid4(), workspace_id=ws.id, project_id=body.project_id, folder_id=body.folder_id,
                 template_id=tpl.id if tpl else None, title=body.title, report_type=body.report_type,
                 language=body.language, metadata_=body.metadata, content=content, layout=layout, created_by=user.id)
    db.add(d)
    db.flush()
    refresh_derived(db, d)
    snapshot(db, d, user.id, "created")
    log_activity(db, user, "document.create", ws.id, "document", d.id, request=request)
    db.commit()
    return doc_to_out(db, d)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return doc_to_out(db, get_document_checked(db, user, doc_id))


@router.put("/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: uuid.UUID, body: DocumentUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id, "editor")
    if body.base_version != d.version:
        # Never overwrite a newer server version silently
        raise HTTPException(409, {"message": "Version conflict", "server_version": d.version,
                                  "client_base_version": body.base_version})
    data = body.model_dump(exclude={"base_version", "create_version", "version_label"}, exclude_unset=True)
    apply_update(db, d, data, user.id, body.create_version, body.version_label)
    db.commit()
    return doc_to_out(db, d)


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id, "editor")
    log_activity(db, user, "document.delete", d.workspace_id, "document", d.id, {"title": d.title})
    db.delete(d)
    db.commit()


@router.post("/{doc_id}/duplicate", response_model=DocumentOut, status_code=201)
def duplicate(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id, "editor")
    n = Document(workspace_id=d.workspace_id, project_id=d.project_id, folder_id=d.folder_id, template_id=d.template_id,
                 title=d.title + " (copy)", report_type=d.report_type, language=d.language, metadata_=d.metadata_,
                 content=d.content, layout=d.layout, created_by=user.id)
    db.add(n)
    db.flush()
    refresh_derived(db, n)
    snapshot(db, n, user.id, "created")
    db.commit()
    return doc_to_out(db, n)


# ---- versions ----
@router.get("/{doc_id}/versions", response_model=list[VersionOut])
def versions(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_document_checked(db, user, doc_id)
    return db.query(DocumentVersion).filter_by(document_id=doc_id).order_by(DocumentVersion.version.desc()).all()


@router.get("/{doc_id}/versions/{version}", response_model=VersionDetail)
def version_detail(doc_id: uuid.UUID, version: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_document_checked(db, user, doc_id)
    v = db.query(DocumentVersion).filter_by(document_id=doc_id, version=version).first()
    if not v:
        raise HTTPException(404, "Version not found")
    return v


@router.post("/{doc_id}/versions/{version}/restore", response_model=DocumentOut)
def restore_version(doc_id: uuid.UUID, version: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id, "editor")
    v = db.query(DocumentVersion).filter_by(document_id=doc_id, version=version).first()
    if not v:
        raise HTTPException(404, "Version not found")
    # snapshot current state first so restore is itself reversible
    if not db.query(DocumentVersion).filter_by(document_id=doc_id, version=d.version).first():
        snapshot(db, d, user.id, "before restore")
    apply_update(db, d, {"content": v.content, "layout": v.layout, "title": v.title}, user.id, True,
                 f"restored from v{version}")
    db.commit()
    return doc_to_out(db, d)


@router.get("/{doc_id}/compare")
def compare(doc_id: uuid.UUID, a: int, b: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id)
    va = db.query(DocumentVersion).filter_by(document_id=doc_id, version=a).first()
    if not va:
        raise HTTPException(404, "Version a not found")
    if b is None:
        cb = d.content
    else:
        vb = db.query(DocumentVersion).filter_by(document_id=doc_id, version=b).first()
        if not vb:
            raise HTTPException(404, "Version b not found")
        cb = vb.content
    return compare_docs(va.content, cb)


@router.get("/{doc_id}/sections")
def sections(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_document_checked(db, user, doc_id)
    return [{"position": s.position, "level": s.level, "heading": s.heading, "anchor": s.anchor}
            for s in db.query(DocumentSection).filter_by(document_id=doc_id).order_by(DocumentSection.position)]


# ---- tags ----
@router.put("/{doc_id}/tags", response_model=list[str])
def set_tags(doc_id: uuid.UUID, body: TagsIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id, "editor")
    db.query(DocumentTag).filter_by(document_id=d.id).delete()
    names = []
    for raw in body.tags:
        name = raw.strip()[:64]
        if not name or name in names:
            continue
        names.append(name)
        tag = db.query(Tag).filter_by(workspace_id=d.workspace_id, name=name).first()
        if not tag:
            tag = Tag(workspace_id=d.workspace_id, name=name)
            db.add(tag)
            db.flush()
        db.add(DocumentTag(document_id=d.id, tag_id=tag.id))
    db.commit()
    return names


# ---- comments ----
@router.get("/{doc_id}/comments", response_model=list[CommentOut])
def list_comments(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_document_checked(db, user, doc_id)
    return db.query(Comment).filter_by(document_id=doc_id).order_by(Comment.created_at).all()


@router.post("/{doc_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(doc_id: uuid.UUID, body: CommentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # viewers may comment (reviewer role); editing content requires editor
    get_document_checked(db, user, doc_id, "viewer")
    c = Comment(document_id=doc_id, author_id=user.id, body=body.body, anchor_text=body.anchor_text, parent_id=body.parent_id)
    db.add(c)
    db.commit()
    return c


@router.put("/{doc_id}/comments/{cid}", response_model=CommentOut)
def resolve_comment(doc_id: uuid.UUID, cid: uuid.UUID, resolved: bool = True, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    get_document_checked(db, user, doc_id, "editor")
    c = db.get(Comment, cid)
    if not c or c.document_id != doc_id:
        raise HTTPException(404, "Comment not found")
    c.resolved = resolved
    db.commit()
    return c


@router.delete("/{doc_id}/comments/{cid}", status_code=204)
def delete_comment(doc_id: uuid.UUID, cid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id, "viewer")
    c = db.get(Comment, cid)
    if not c or c.document_id != doc_id:
        raise HTTPException(404, "Comment not found")
    if c.author_id != user.id:
        require_role(db, user, d.workspace_id, "admin")
    db.delete(c)
    db.commit()


@router.post("/import", response_model=DocumentOut, status_code=201)
async def import_document(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Import a .docx, .md or .txt file as a new document."""
    from ..config import get_settings
    from ..documents.docx_import import import_docx
    from ..services.files import sniff
    form = await request.form()
    f = form.get("file")
    if f is None or not hasattr(f, "read"):
        raise HTTPException(400, "file is required")
    data = await f.read()
    if len(data) > get_settings().max_upload_mb * 1024 * 1024:
        raise HTTPException(413, "File too large")
    mime = sniff(data, f.filename or "")
    ws_id = form.get("workspace_id")
    ws = resolve_workspace(db, user, uuid.UUID(ws_id) if ws_id else None, "editor")
    if mime and "wordprocessingml" in mime:
        try:
            title, content = import_docx(data)
        except Exception as e:
            raise HTTPException(422, f"Could not read DOCX: {e.__class__.__name__}")
    elif mime == "text/plain":
        text = data.decode("utf-8")
        content = {"type": "doc", "content": []}
        for line in text.splitlines():
            if line.startswith("#"):
                lvl = min(6, len(line) - len(line.lstrip("#")))
                content["content"].append({"type": "heading", "attrs": {"level": lvl},
                                           "content": [{"type": "text", "text": line.lstrip("# ").strip() or " "}]})
            elif line.strip():
                content["content"].append({"type": "paragraph", "content": [{"type": "text", "text": line}]})
        content["content"] = content["content"] or [{"type": "paragraph"}]
        title = (f.filename or "Imported").rsplit(".", 1)[0]
    else:
        raise HTTPException(415, "Only .docx, .md and .txt files can be imported")
    check_content(content, None)
    from ..documents.schema import detect_direction, plain_text as pt
    lang = "ar" if detect_direction(pt(content)) == "rtl" else "en"
    d = Document(workspace_id=ws.id, title=title, language=lang, content=content,
                 layout={**DEFAULT_LAYOUT, "direction": "rtl" if lang == "ar" else "ltr"}, created_by=user.id)
    db.add(d)
    db.flush()
    refresh_derived(db, d)
    snapshot(db, d, user.id, "imported")
    db.commit()
    return doc_to_out(db, d)
