import uuid

import jwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ActivityLog, Document, User, WorkspaceMember
from .security import decode_token

ROLE_RANK = {"viewer": 0, "editor": 1, "admin": 2, "owner": 3}


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        data = decode_token(authorization[7:], "access")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, uuid.UUID(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or disabled")
    return user


def require_role(db: Session, user: User, workspace_id: uuid.UUID, min_role: str) -> WorkspaceMember:
    m = db.query(WorkspaceMember).filter_by(workspace_id=workspace_id, user_id=user.id).first()
    if not m:
        # 404 rather than 403 to avoid leaking existence across workspaces
        raise HTTPException(404, "Not found")
    if ROLE_RANK[m.role] < ROLE_RANK[min_role]:
        raise HTTPException(403, f"Requires role '{min_role}'")
    return m


def get_document_checked(db: Session, user: User, doc_id: uuid.UUID, min_role: str = "viewer") -> Document:
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    require_role(db, user, doc.workspace_id, min_role)
    return doc


def log_activity(db: Session, user: User | None, action: str, workspace_id=None, entity_type="", entity_id="",
                 details: dict | None = None, request: Request | None = None):
    db.add(ActivityLog(user_id=user.id if user else None, workspace_id=workspace_id, action=action,
                       entity_type=entity_type, entity_id=str(entity_id), details=details or {},
                       ip=(request.client.host if request and request.client else "")))
