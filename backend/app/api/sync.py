"""Offline sync: clients push queued operations with the version they were based on; server never
overwrites a newer version. Conflicts are returned with both copies + a diff for user resolution."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.deps import current_user, log_activity, require_role
from ..db import get_db
from ..models import ActivityLog, Document, SyncOperation, User
from ..schemas import SyncPullIn, SyncPushIn
from ..services.diff import compare_docs
from ..services.documents import apply_update, check_content, refresh_derived, snapshot
from .common import doc_to_out, resolve_workspace

router = APIRouter(prefix="/sync", tags=["sync"])
FIELDS = ("title", "content", "layout", "status", "report_type", "language", "is_favorite", "project_id", "folder_id")


def _next_seq(db, ws_id) -> int:
    return int(db.query(func.coalesce(func.max(SyncOperation.server_seq), 0)).filter_by(workspace_id=ws_id).scalar()) + 1


@router.post("/push")
def push(body: SyncPushIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    results = []
    for op in body.operations:
        prev = db.query(SyncOperation).filter_by(device_id=body.device_id, client_op_id=op.client_op_id).first()
        if prev:
            results.append({"client_op_id": op.client_op_id, "status": "duplicate", "previous": prev.result})
            continue
        d = db.get(Document, op.entity_id)
        if d and d.workspace_id != ws.id:
            require_role(db, user, d.workspace_id, "editor")
        status, extra = "applied", {}
        data = {k: v for k, v in op.data.items() if k in FIELDS}
        if "metadata" in op.data:
            data["metadata"] = op.data["metadata"]
        try:
            check_content(data.get("content"), data.get("layout"))
        except Exception as e:
            results.append({"client_op_id": op.client_op_id, "status": "rejected", "error": getattr(e, "detail", str(e))})
            continue
        if op.op == "upsert" and d is None:
            if op.base_version > 0:
                status, extra = "conflict", {"reason": "deleted_on_server"}
            else:
                d = Document(id=op.entity_id, workspace_id=ws.id, created_by=user.id, title=data.get("title") or "Untitled",
                             content=data.get("content") or {"type": "doc", "content": [{"type": "paragraph"}]},
                             layout=data.get("layout") or {}, language=data.get("language", "ar"),
                             report_type=data.get("report_type", "academic"), metadata_=data.get("metadata", {}))
                db.add(d)
                db.flush()
                refresh_derived(db, d)
                snapshot(db, d, user.id, "created (sync)")
                extra = {"version": d.version}
        elif op.op == "upsert":
            if op.base_version == d.version:
                apply_update(db, d, data, user.id)
                extra = {"version": d.version}
            else:
                status = "conflict"
                extra = {"reason": "version_mismatch", "server_version": d.version, "server": doc_to_out(db, d),
                         "diff": compare_docs(d.content or {}, data.get("content") or d.content or {})}
        elif op.op == "delete":
            if d is None:
                status = "applied"
            elif op.base_version == d.version:
                log_activity(db, user, "document.delete", d.workspace_id, "document", d.id, {"via": "sync"})
                db.delete(d)
            else:
                status, extra = "conflict", {"reason": "modified_on_server", "server_version": d.version,
                                             "server": doc_to_out(db, d)}
        db.add(SyncOperation(workspace_id=ws.id, user_id=user.id, device_id=body.device_id, client_op_id=op.client_op_id,
                             entity_type=op.entity_type, entity_id=op.entity_id, op=op.op, base_version=op.base_version,
                             result=status, server_seq=_next_seq(db, ws.id)))
        db.flush()
        results.append({"client_op_id": op.client_op_id, "entity_id": str(op.entity_id), "status": status, **extra})
    db.commit()
    return {"results": results, "server_time": datetime.now(timezone.utc).isoformat()}


@router.post("/pull")
def pull(body: SyncPullIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, body.workspace_id)
    now = datetime.now(timezone.utc)
    q = db.query(Document).filter(Document.workspace_id == ws.id)
    dq = db.query(ActivityLog).filter(ActivityLog.workspace_id == ws.id, ActivityLog.action == "document.delete")
    if body.since:
        since = body.since if body.since.tzinfo else body.since.replace(tzinfo=timezone.utc)
        # SQLite stores naive datetimes; compare in UTC naive form for portability
        since_cmp = since.astimezone(timezone.utc).replace(tzinfo=None) if db.bind.dialect.name == "sqlite" else since
        q = q.filter(Document.updated_at > since_cmp)
        dq = dq.filter(ActivityLog.created_at > since_cmp)
    docs = [doc_to_out(db, d) for d in q.order_by(Document.updated_at).limit(1000)]
    return {"documents": docs, "deleted": sorted({a.entity_id for a in dq}), "server_time": now.isoformat()}
