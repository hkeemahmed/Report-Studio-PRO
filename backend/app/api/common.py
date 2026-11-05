import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..auth.deps import require_role
from ..models import Document, User, Workspace, WorkspaceMember
from ..services.documents import doc_tags


def resolve_workspace(db: Session, user: User, workspace_id: uuid.UUID | None, min_role="viewer") -> Workspace:
    if workspace_id is None:
        m = (db.query(WorkspaceMember).filter_by(user_id=user.id).order_by(WorkspaceMember.created_at).first())
        if not m:
            raise HTTPException(404, "No workspace")
        workspace_id = m.workspace_id
    require_role(db, user, workspace_id, min_role)
    return db.get(Workspace, workspace_id)


def doc_to_out(db: Session, d: Document, full=True) -> dict:
    out = {k: getattr(d, k) for k in ("id", "workspace_id", "project_id", "folder_id", "title", "report_type",
                                      "language", "status", "is_favorite", "version", "created_at", "updated_at")}
    out["tags"] = doc_tags(db, d.id)
    if full:
        out.update(template_id=d.template_id, metadata=d.metadata_ or {}, content=d.content or {}, layout=d.layout or {})
    return out
