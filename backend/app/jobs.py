"""Background jobs (Celery + Redis). Without RSP_REDIS_URL, tasks run eagerly in-process so desktop/offline
installs need no broker. Start a worker with:  celery -A app.jobs worker -l info"""
import os
import uuid

from celery import Celery

broker = os.getenv("RSP_REDIS_URL", "")
celery_app = Celery("report_studio", broker=broker or "memory://", backend=broker or "cache+memory://")
celery_app.conf.update(task_always_eager=not broker, task_eager_propagates=False, task_serializer="json",
                       result_serializer="json", accept_content=["json"], task_acks_late=True, worker_prefetch_multiplier=1)


@celery_app.task(name="exports.render", bind=True, max_retries=2)
def render_export(self, export_id: str, content: dict | None = None, layout: dict | None = None):
    from .api.exports import FORMATS, build_context
    from .db import SessionLocal, get_engine
    from .models import Document, Export
    from .services.storage import get_storage
    get_engine()
    with SessionLocal() as db:
        ex = db.get(Export, uuid.UUID(export_id))
        if not ex:
            return
        ex.status = "running"
        db.commit()
        try:
            d = db.get(Document, ex.document_id)
            _, fn, ext = FORMATS[ex.format]
            out = fn(build_context(db, d, content, layout))
            data = out.encode("utf-8") if isinstance(out, str) else out
            key = f"{d.workspace_id}/exports/{ex.id}.{ext}"
            get_storage().put(key, data)
            ex.storage_key, ex.size_bytes, ex.status = key, len(data), "done"
        except Exception as e:  # recorded for the client; never crash the worker
            ex.status, ex.error = "error", f"{e.__class__.__name__}: {e}"[:2000]
        db.commit()
