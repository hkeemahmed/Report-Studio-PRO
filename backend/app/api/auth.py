import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth.deps import current_user, log_activity
from ..auth.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from ..db import get_db
from ..models import Subscription, User, Workspace, WorkspaceMember
from ..schemas import LoginIn, PasswordChange, RefreshIn, RegisterIn, TokenOut, UserOut, UserUpdate

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(u: User) -> TokenOut:
    return TokenOut(access_token=create_access_token(u.id), refresh_token=create_refresh_token(u.id, u.token_version))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "Email already registered")
    u = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name, locale=body.locale)
    db.add(u)
    db.flush()
    ws = Workspace(name=(body.full_name or email.split("@")[0]) + " — Workspace", owner_id=u.id)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=u.id, role="owner"))
    db.add(Subscription(workspace_id=ws.id, plan="free"))
    log_activity(db, u, "auth.register", ws.id, "user", u.id, request=request)
    db.commit()
    return _tokens(u)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=body.email.lower()).first()
    if not u or not verify_password(body.password, u.password_hash) or not u.is_active:
        log_activity(db, u, "auth.login_failed", details={"email": body.email.lower()}, request=request)
        db.commit()
        raise HTTPException(401, "Invalid email or password")
    log_activity(db, u, "auth.login", request=request)
    db.commit()
    return _tokens(u)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    try:
        data = decode_token(body.refresh_token, "refresh")
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid refresh token")
    u = db.get(User, uuid.UUID(data["sub"]))
    if not u or not u.is_active or data.get("tv") != u.token_version:
        raise HTTPException(401, "Refresh token revoked")
    return _tokens(u)


@router.post("/logout-all", status_code=204)
def logout_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Revokes every refresh token of the user (all sessions/devices)."""
    user.token_version += 1
    db.add(user)
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(body: UserUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.add(user)
    db.commit()
    return user


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    RegisterIn.strong(body.new_password)
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.add(user)
    log_activity(db, user, "auth.password_changed")
    db.commit()
