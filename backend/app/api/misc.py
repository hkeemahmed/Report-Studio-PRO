import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.deps import current_user, get_document_checked
from ..db import get_db
from ..models import ActivityLog, AIRequest, Document, Project, Template, User
from ..services.review import review_document
from ..services.diff import compare_docs
from .common import doc_to_out, resolve_workspace

router = APIRouter(tags=["dashboard", "review"])


@router.get("/dashboard")
def dashboard(workspace_id: uuid.UUID | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    base = db.query(Document).filter(Document.workspace_id == ws.id)
    count = lambda q: q.with_entities(func.count(Document.id)).scalar()
    month_ago = datetime.now(timezone.utc) - timedelta(days=30)
    recent = base.order_by(Document.updated_at.desc()).limit(8).all()
    favs = base.filter(Document.is_favorite.is_(True)).order_by(Document.updated_at.desc()).limit(8).all()
    tpl_ids = [r[0] for r in db.query(Document.template_id).filter(Document.workspace_id == ws.id, Document.template_id.isnot(None))
               .order_by(Document.created_at.desc()).limit(30)]
    seen, recent_tpls = set(), []
    for tid in tpl_ids:
        if tid not in seen:
            seen.add(tid)
            t = db.get(Template, tid)
            if t:
                recent_tpls.append({"id": t.id, "name": t.name, "name_ar": t.name_ar, "category": t.category})
    notifications = [{"action": a.action, "entity_type": a.entity_type, "details": a.details, "created_at": a.created_at}
                     for a in db.query(ActivityLog).filter(ActivityLog.workspace_id == ws.id)
                     .order_by(ActivityLog.created_at.desc()).limit(10)]
    return {
        "workspace": {"id": ws.id, "name": ws.name},
        "total_reports": count(base),
        "completed": count(base.filter(Document.status == "completed")),
        "in_progress": count(base.filter(Document.status.in_(["draft", "in_progress"]))),
        "projects": db.query(func.count(Project.id)).filter(Project.workspace_id == ws.id, Project.is_archived.is_(False)).scalar(),
        "ai_requests_30d": db.query(func.count(AIRequest.id)).filter(AIRequest.workspace_id == ws.id,
                                                                     AIRequest.created_at > month_ago).scalar(),
        "recent": [doc_to_out(db, d, full=False) for d in recent],
        "favorites": [doc_to_out(db, d, full=False) for d in favs],
        "recent_templates": recent_tpls[:6],
        "notifications": notifications,
    }


@router.get("/documents/{doc_id}/review")
def review(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    d = get_document_checked(db, user, doc_id)
    return review_document(d.content or {}, d.report_type)


@router.post("/review/compare")
def compare_any(body: dict, user: User = Depends(current_user)):
    """Compare two arbitrary documents (e.g. current editor content vs an imported file)."""
    return compare_docs(body.get("a") or {}, body.get("b") or {})
