import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.deps import current_user, log_activity, require_role
from ..db import get_db
from ..models import Subscription, User, Workspace, WorkspaceMember
from ..schemas import MemberIn, MemberOut, WorkspaceIn, WorkspaceWithRole

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceWithRole])
def list_ws(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Workspace, WorkspaceMember.role).join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)\
        .filter(WorkspaceMember.user_id == user.id).order_by(WorkspaceMember.created_at).all()
    return [{**{c: getattr(w, c) for c in ("id", "name", "owner_id", "ai_monthly_token_limit")}, "role": r}
            for w, r in rows]


@router.post("", response_model=WorkspaceWithRole, status_code=201)
def create_ws(body: WorkspaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = Workspace(name=body.name, owner_id=user.id)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner"))
    db.add(Subscription(workspace_id=ws.id, plan="free"))
    db.commit()
    return {"id": ws.id, "name": ws.name, "owner_id": ws.owner_id, "ai_monthly_token_limit": 0, "role": "owner"}


@router.get("/{ws_id}/members", response_model=list[MemberOut])
def members(ws_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, user, ws_id, "viewer")
    rows = db.query(WorkspaceMember, User).join(User, User.id == WorkspaceMember.user_id).filter(WorkspaceMember.workspace_id == ws_id)
    return [MemberOut(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role) for m, u in rows]


@router.post("/{ws_id}/members", response_model=MemberOut, status_code=201)
def add_member(ws_id: uuid.UUID, body: MemberIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, user, ws_id, "admin")
    target = db.query(User).filter_by(email=body.email.lower()).first()
    if not target:
        raise HTTPException(404, "No user with this email. Ask them to register first.")
    m = db.query(WorkspaceMember).filter_by(workspace_id=ws_id, user_id=target.id).first()
    if m:
        if m.role == "owner":
            raise HTTPException(400, "Cannot change owner role")
        m.role = body.role
    else:
        m = WorkspaceMember(workspace_id=ws_id, user_id=target.id, role=body.role)
        db.add(m)
    log_activity(db, user, "workspace.member_set", ws_id, "user", target.id, {"role": body.role})
    db.commit()
    return MemberOut(user_id=target.id, email=target.email, full_name=target.full_name, role=m.role)


@router.delete("/{ws_id}/members/{user_id}", status_code=204)
def remove_member(ws_id: uuid.UUID, user_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_role(db, user, ws_id, "admin")
    m = db.query(WorkspaceMember).filter_by(workspace_id=ws_id, user_id=user_id).first()
    if not m:
        raise HTTPException(404, "Member not found")
    if m.role == "owner":
        raise HTTPException(400, "Cannot remove the owner")
    db.delete(m)
    log_activity(db, user, "workspace.member_removed", ws_id, "user", user_id)
    db.commit()
