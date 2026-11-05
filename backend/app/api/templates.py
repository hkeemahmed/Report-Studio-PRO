import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.deps import current_user, require_role
from ..db import get_db
from ..documents.schema import normalize_layout, SchemaError
from ..models import Template, TemplateStyle, User, WorkspaceMember
from ..schemas import TemplateIn, TemplateOut
from .common import resolve_workspace

router = APIRouter(prefix="/templates", tags=["templates"])


def _out(db, t: Template) -> dict:
    styles = {s.style_key: s.props for s in db.query(TemplateStyle).filter_by(template_id=t.id)}
    return {**{k: getattr(t, k) for k in ("id", "slug", "name", "name_ar", "category", "structure", "layout", "is_builtin")},
            "styles": styles}


@router.get("", response_model=list[TemplateOut])
def list_templates(category: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws_ids = [m.workspace_id for m in db.query(WorkspaceMember).filter_by(user_id=user.id)]
    q = db.query(Template).filter(or_(Template.is_builtin.is_(True), Template.workspace_id.in_(ws_ids)))
    if category:
        q = q.filter(Template.category == category)
    return [_out(db, t) for t in q.order_by(Template.is_builtin.desc(), Template.name)]


def _save(db, t: Template, body: TemplateIn):
    try:
        normalize_layout(body.layout)
    except SchemaError as e:
        raise HTTPException(422, str(e))
    t.name, t.name_ar, t.category, t.structure, t.layout = body.name, body.name_ar, body.category, body.structure, body.layout
    db.flush()
    db.query(TemplateStyle).filter_by(template_id=t.id).delete()
    for k, v in body.styles.items():
        db.add(TemplateStyle(template_id=t.id, style_key=k[:64], props=v))


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    slug = re.sub(r"[^a-z0-9]+", "-", body.name.lower()).strip("-") or "custom"
    t = Template(workspace_id=ws.id, slug=f"{slug}-{uuid.uuid4().hex[:6]}", is_builtin=False)
    db.add(t)
    _save(db, t, body)
    db.commit()
    return _out(db, t)


@router.put("/{tid}", response_model=TemplateOut)
def update_template(tid: uuid.UUID, body: TemplateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(Template, tid)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.is_builtin:
        raise HTTPException(400, "Built-in templates are read-only; duplicate it instead")
    require_role(db, user, t.workspace_id, "editor")
    _save(db, t, body)
    db.commit()
    return _out(db, t)


@router.delete("/{tid}", status_code=204)
def delete_template(tid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(Template, tid)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.is_builtin:
        raise HTTPException(400, "Built-in templates cannot be deleted")
    require_role(db, user, t.workspace_id, "editor")
    db.delete(t)
    db.commit()
