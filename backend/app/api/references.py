import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.deps import current_user, get_document_checked, require_role
from ..db import get_db
from ..models import BibliographicSource, Citation, User
from ..references.importers import parse_bibtex, parse_ris, validate_doi, validate_isbn
from ..references.styles import format_reference, in_text, sort_for_bibliography
from ..schemas import FormatIn, ImportIn, SourceIn, SourceOut
from .common import resolve_workspace

router = APIRouter(prefix="/references", tags=["references"])


def as_dict(s: BibliographicSource) -> dict:
    return {"id": str(s.id), "source_type": s.source_type, "title": s.title, "authors": s.authors or [], "year": s.year,
            "doi": s.doi, "isbn": s.isbn, "data": s.data or {}}


def _validate(body: SourceIn):
    if body.doi and not validate_doi(body.doi):
        raise HTTPException(422, "Invalid DOI format (expected 10.xxxx/...)")
    if body.isbn and not validate_isbn(body.isbn):
        raise HTTPException(422, "Invalid ISBN checksum")


def _get(db, user, sid, role="viewer") -> BibliographicSource:
    s = db.get(BibliographicSource, sid)
    if not s:
        raise HTTPException(404, "Source not found")
    require_role(db, user, s.workspace_id, role)
    return s


@router.get("", response_model=list[SourceOut])
def list_sources(workspace_id: uuid.UUID | None = None, project_id: uuid.UUID | None = None,
                 q: str = Query("", max_length=200), user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    qry = db.query(BibliographicSource).filter_by(workspace_id=ws.id)
    if project_id:
        qry = qry.filter(BibliographicSource.project_id == project_id)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(BibliographicSource.title.ilike(like), BibliographicSource.doi.ilike(like),
                             BibliographicSource.year.ilike(like)))
    return qry.order_by(BibliographicSource.created_at.desc()).limit(1000).all()


@router.post("", response_model=SourceOut, status_code=201)
def create_source(body: SourceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    _validate(body)
    s = BibliographicSource(workspace_id=ws.id, **body.model_dump(exclude={"workspace_id", "authors"}),
                            authors=[a.model_dump() for a in body.authors])
    db.add(s)
    db.commit()
    return s


@router.put("/{sid}", response_model=SourceOut)
def update_source(sid: uuid.UUID, body: SourceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, user, sid, "editor")
    _validate(body)
    for k, v in body.model_dump(exclude={"workspace_id", "authors"}).items():
        setattr(s, k, v)
    s.authors = [a.model_dump() for a in body.authors]
    db.commit()
    return s


@router.delete("/{sid}", status_code=204)
def delete_source(sid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = _get(db, user, sid, "editor")
    db.query(Citation).filter_by(source_id=s.id).delete()
    db.delete(s)
    db.commit()


@router.post("/import", response_model=list[SourceOut], status_code=201)
def import_sources(body: ImportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    parsed = parse_bibtex(body.text) if body.format == "bibtex" else parse_ris(body.text)
    if not parsed:
        raise HTTPException(422, "No entries found")
    out = []
    for p in parsed:
        if not p.get("title"):
            continue
        s = BibliographicSource(workspace_id=ws.id, **{**p, "title": p["title"][:1000]})
        db.add(s)
        out.append(s)
    db.commit()
    return out


@router.post("/format")
def format_sources(body: FormatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    srcs = [as_dict(_get(db, user, sid)) for sid in body.source_ids]
    numeric = body.style in ("ieee", "vancouver")
    ordered = sort_for_bibliography(srcs, body.style)
    return {"style": body.style, "entries": [
        {"id": s["id"], "text": format_reference(s, body.style, i + 1 if numeric else None),
         "in_text": in_text(s, body.style, i + 1)} for i, s in enumerate(ordered)]}


@router.post("/documents/{doc_id}/citations/sync")
def sync_citations(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Rebuild the citations table from citation nodes in the document content."""
    from ..documents.schema import collect
    d = get_document_checked(db, user, doc_id, "editor")
    db.query(Citation).filter_by(document_id=d.id).delete()
    n = 0
    for c in collect(d.content or {}, "citation"):
        a = c.get("attrs") or {}
        try:
            sid = uuid.UUID(str(a.get("sourceId")))
        except ValueError:
            continue
        s = db.get(BibliographicSource, sid)
        if s and s.workspace_id == d.workspace_id:
            db.add(Citation(document_id=d.id, source_id=sid, locator=str(a.get("locator", ""))[:64]))
            n += 1
    db.commit()
    return {"citations": n}
