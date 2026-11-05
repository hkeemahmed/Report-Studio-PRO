import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..documents.schema import SchemaError, extract_sections, normalize_layout, plain_text, validate_content
from ..models import Document, DocumentSection, DocumentTag, DocumentVersion, Tag

SNAPSHOT_INTERVAL = timedelta(minutes=5)


def check_content(content: dict | None, layout: dict | None):
    try:
        if content is not None:
            validate_content(content)
        if layout is not None:
            normalize_layout(layout)
    except SchemaError as e:
        raise HTTPException(422, f"Invalid document: {e}")


def refresh_derived(db: Session, doc: Document):
    doc.plain_text = plain_text(doc.content or {})[:1_000_000]
    db.query(DocumentSection).filter_by(document_id=doc.id).delete()
    for s in extract_sections(doc.content or {}):
        db.add(DocumentSection(document_id=doc.id, **s))


def snapshot(db: Session, doc: Document, user_id, label: str = ""):
    db.add(DocumentVersion(document_id=doc.id, version=doc.version, title=doc.title, content=doc.content,
                           layout=doc.layout, label=label, created_by=user_id))


def maybe_snapshot(db: Session, doc: Document, user_id, force: bool, label: str):
    last = db.query(DocumentVersion).filter_by(document_id=doc.id).order_by(DocumentVersion.version.desc()).first()
    created = last.created_at if last else None
    if created and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if force or label or not last or datetime.now(timezone.utc) - created > SNAPSHOT_INTERVAL:
        snapshot(db, doc, user_id, label)


def apply_update(db: Session, doc: Document, data: dict, user_id, force_version=False, label=""):
    """Apply field changes, bump version, keep derived data + history consistent. Caller commits."""
    check_content(data.get("content"), data.get("layout"))
    changed = False
    for field in ("title", "content", "layout", "status", "project_id", "folder_id", "is_favorite", "report_type", "language"):
        if field in data and data[field] is not None and getattr(doc, field) != data[field]:
            setattr(doc, field, data[field])
            changed = True
    if data.get("metadata") is not None and doc.metadata_ != data["metadata"]:
        doc.metadata_ = data["metadata"]
        changed = True
    if changed or force_version:
        doc.version += 1
        doc.updated_at = datetime.now(timezone.utc)
        if "content" in data:
            refresh_derived(db, doc)
        maybe_snapshot(db, doc, user_id, force_version, label)
    return changed


def doc_tags(db: Session, doc_id: uuid.UUID) -> list[str]:
    return [t.name for t in db.query(Tag).join(DocumentTag, DocumentTag.tag_id == Tag.id).filter(DocumentTag.document_id == doc_id)]
