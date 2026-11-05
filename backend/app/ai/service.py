import time
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.security import decrypt_secret
from ..models import AIRequest, AIUsage, Workspace
from .providers import AIError, ChatResult, build_provider


def period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def provider_config(ws: Workspace, provider_id: str | None) -> dict:
    providers = ws.ai_providers or []
    if not providers:
        raise HTTPException(400, "No AI provider configured. Add one in Settings → AI Providers.")
    p = next((x for x in providers if x["id"] == provider_id), None) if provider_id else \
        next((x for x in providers if x.get("is_default")), providers[0])
    if not p:
        raise HTTPException(404, "AI provider not found")
    cfg = dict(p)
    if cfg.get("api_key_enc"):
        cfg["api_key"] = decrypt_secret(cfg["api_key_enc"])
    return cfg


def tokens_used(db: Session, ws_id: uuid.UUID, provider: str | None = None) -> int:
    q = db.query(func.coalesce(func.sum(AIUsage.prompt_tokens + AIUsage.completion_tokens), 0))\
        .filter(AIUsage.workspace_id == ws_id, AIUsage.period == period())
    if provider:
        q = q.join(AIRequest, AIRequest.id == AIUsage.request_id).filter(AIRequest.provider == provider)
    return int(q.scalar() or 0)


def check_limits(db: Session, ws: Workspace, cfg: dict):
    if ws.ai_monthly_token_limit and tokens_used(db, ws.id) >= ws.ai_monthly_token_limit:
        raise HTTPException(429, "Monthly AI token limit for this workspace reached")
    if cfg.get("monthly_token_limit") and tokens_used(db, ws.id, cfg["name"]) >= cfg["monthly_token_limit"]:
        raise HTTPException(429, f"Monthly token limit for provider '{cfg['name']}' reached")


def run_chat(db: Session, ws: Workspace, user_id, document_id, provider_id, action: str, messages,
             temperature=0.4, max_tokens=2048) -> tuple[ChatResult, dict]:
    cfg = provider_config(ws, provider_id)
    check_limits(db, ws, cfg)
    req = AIRequest(workspace_id=ws.id, user_id=user_id, document_id=document_id, provider=cfg["name"],
                    model=cfg.get("model", ""), action=action, status="ok")
    t0 = time.monotonic()
    try:
        res = build_provider(cfg).chat(messages, temperature, max_tokens)
    except AIError as e:
        req.status, req.error = "error", str(e)[:2000]
        req.latency_ms = int((time.monotonic() - t0) * 1000)
        db.add(req)
        db.commit()
        raise HTTPException(e.status, str(e))
    req.latency_ms, req.model = res.latency_ms, res.model
    db.add(req)
    db.flush()
    db.add(AIUsage(request_id=req.id, workspace_id=ws.id, period=period(), prompt_tokens=res.prompt_tokens,
                   completion_tokens=res.completion_tokens))
    db.commit()
    return res, cfg
