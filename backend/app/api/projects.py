import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth.deps import current_user, log_activity, require_role
from ..db import get_db
from ..models import Document, Folder, Project, User
from ..schemas import FolderIn, FolderOut, ProjectIn, ProjectOut, ProjectUpdate
from .common import resolve_workspace

router = APIRouter(tags=["projects"])


def _out(db, p: Project) -> dict:
    n = db.query(func.count(Document.id)).filter(Document.project_id == p.id).scalar()
    return {**ProjectOut.model_validate(p).model_dump(exclude={"document_count"}), "document_count": n}


def _get(db, user, pid, role="viewer") -> Project:
    p = db.get(Project, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    require_role(db, user, p.workspace_id, role)
    return p


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(workspace_id: uuid.UUID | None = None, q: str = Query("", max_length=200), archived: bool = False,
                  favorite: bool | None = None, category: str = "", user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    qry = db.query(Project).filter(Project.workspace_id == ws.id, Project.is_archived == archived)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(Project.name.ilike(like), Project.description.ilike(like)))
    if favorite is not None:
        qry = qry.filter(Project.is_favorite == favorite)
    if category:
        qry = qry.filter(Project.category == category)
    return [_out(db, p) for p in qry.order_by(Project.updated_at.desc()).limit(500)]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    p = Project(workspace_id=ws.id, name=body.name, description=body.description, category=body.category, created_by=user.id)
    db.add(p)
    db.flush()
    log_activity(db, user, "project.create", ws.id, "project", p.id)
    db.commit()
    return _out(db, p)


@router.get("/projects/{pid}", response_model=ProjectOut)
def get_project(pid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _out(db, _get(db, user, pid))


@router.put("/projects/{pid}", response_model=ProjectOut)
def update_project(pid: uuid.UUID, body: ProjectUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get(db, user, pid, "editor")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    log_activity(db, user, "project.update", p.workspace_id, "project", p.id, body.model_dump(exclude_none=True))
    db.commit()
    return _out(db, p)


@router.delete("/projects/{pid}", status_code=204)
def delete_project(pid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Deletes the project. Its documents are kept (detached) so no report is lost."""
    p = _get(db, user, pid, "admin")
    db.query(Document).filter(Document.project_id == p.id).update({"project_id": None, "folder_id": None})
    log_activity(db, user, "project.delete", p.workspace_id, "project", p.id, {"name": p.name})
    db.delete(p)
    db.commit()


@router.get("/projects/{pid}/folders", response_model=list[FolderOut])
def list_folders(pid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _get(db, user, pid)
    return db.query(Folder).filter_by(project_id=pid).order_by(Folder.name).all()


@router.post("/folders", response_model=FolderOut, status_code=201)
def create_folder(body: FolderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _get(db, user, body.project_id, "editor")
    if body.parent_id:
        parent = db.get(Folder, body.parent_id)
        if not parent or parent.project_id != body.project_id:
            raise HTTPException(400, "Parent folder must belong to the same project")
    f = Folder(project_id=body.project_id, parent_id=body.parent_id, name=body.name)
    db.add(f)
    db.commit()
    return f


@router.put("/folders/{fid}", response_model=FolderOut)
def rename_folder(fid: uuid.UUID, body: FolderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(Folder, fid)
    if not f:
        raise HTTPException(404, "Folder not found")
    _get(db, user, f.project_id, "editor")
    f.name = body.name
    db.commit()
    return f


@router.delete("/folders/{fid}", status_code=204)
def delete_folder(fid: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(Folder, fid)
    if not f:
        raise HTTPException(404, "Folder not found")
    _get(db, user, f.project_id, "editor")
    db.query(Document).filter(Document.folder_id == fid).update({"folder_id": None})
    db.delete(f)
    db.commit()
