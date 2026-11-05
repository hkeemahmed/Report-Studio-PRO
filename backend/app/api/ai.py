import json
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..ai import prompts
from ..ai.providers import AIError, build_provider
from ..ai.rag import bm25_scores, cosine, verify_citations
from ..ai.service import period, provider_config, run_chat, tokens_used
from ..auth.deps import current_user, get_document_checked, log_activity, require_role
from ..auth.security import encrypt_secret
from ..config import get_settings
from ..db import get_db
from ..models import AIRequest, AIUsage, Asset, User
from ..schemas import AIGenerateIn, AIResearchIn, AIResult, ProviderIn, ProviderOut
from ..services.ratelimit import limiter
from .common import resolve_workspace

router = APIRouter(prefix="/ai", tags=["ai"])

WRITER = {"full_report", "introduction", "conclusion", "objectives", "abstract", "chapters", "subheadings", "section"}
EDITOR = {"improve", "rewrite", "expand", "summarize", "shorten", "correct", "academic", "translate", "explain", "citations"}
ANALYSIS = {"analyze_data", "make_table", "suggest_chart", "discussion", "review"}


def _rate(user: User):
    if not limiter.allow(f"ai:{user.id}", get_settings().ai_rate_limit_per_minute):
        raise HTTPException(429, "Too many AI requests, slow down")


def _pub(p: dict) -> dict:
    return {"id": p["id"], "name": p["name"], "type": p["type"], "base_url": p.get("base_url", ""), "model": p.get("model", ""),
            "embedding_model": p.get("embedding_model", ""), "is_default": bool(p.get("is_default")),
            "has_api_key": bool(p.get("api_key_enc")), "monthly_token_limit": p.get("monthly_token_limit", 0)}


# ---------- provider management ----------
@router.get("/providers", response_model=list[ProviderOut])
def list_providers(workspace_id: uuid.UUID | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    return [_pub(p) for p in ws.ai_providers or []]


@router.post("/providers", response_model=ProviderOut)
def upsert_provider(body: ProviderIn, workspace_id: uuid.UUID | None = None, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id, "admin")
    providers = [dict(p) for p in ws.ai_providers or []]
    existing = next((p for p in providers if p["id"] == body.id), None) if body.id else None
    entry = existing or {"id": uuid.uuid4().hex[:12]}
    entry.update(name=body.name, type=body.type, base_url=body.base_url, model=body.model,
                 embedding_model=body.embedding_model, monthly_token_limit=body.monthly_token_limit)
    if body.api_key is not None:
        entry["api_key_enc"] = encrypt_secret(body.api_key) if body.api_key else ""
    if not existing:
        providers.append(entry)
    if body.is_default or len(providers) == 1:
        for p in providers:
            p["is_default"] = p["id"] == entry["id"]
    ws.ai_providers = providers
    log_activity(db, user, "ai.provider_saved", ws.id, "provider", entry["id"], {"type": body.type})
    db.commit()
    return _pub(entry)


@router.delete("/providers/{pid}", status_code=204)
def delete_provider(pid: str, workspace_id: uuid.UUID | None = None, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id, "admin")
    providers = [p for p in ws.ai_providers or [] if p["id"] != pid]
    if providers and not any(p.get("is_default") for p in providers):
        providers[0] = {**providers[0], "is_default": True}
    ws.ai_providers = providers
    db.commit()


@router.post("/providers/{pid}/test")
def test_provider(pid: str, workspace_id: uuid.UUID | None = None, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id, "editor")
    cfg = provider_config(ws, pid)
    try:
        models = build_provider(cfg).list_models()
    except AIError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "models": models[:200], "model_available": not cfg.get("model") or cfg["model"] in models
            or any(m.startswith(cfg["model"]) for m in models)}


@router.get("/usage")
def usage(workspace_id: uuid.UUID | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id)
    rows = db.query(AIRequest.provider, AIRequest.action, func.count(AIRequest.id),
                    func.coalesce(func.sum(AIUsage.prompt_tokens), 0), func.coalesce(func.sum(AIUsage.completion_tokens), 0))\
        .outerjoin(AIUsage, AIUsage.request_id == AIRequest.id).filter(AIRequest.workspace_id == ws.id)\
        .group_by(AIRequest.provider, AIRequest.action).all()
    errors = db.query(func.count(AIRequest.id)).filter(AIRequest.workspace_id == ws.id, AIRequest.status == "error").scalar()
    return {"period": period(), "tokens_this_month": tokens_used(db, ws.id), "monthly_limit": ws.ai_monthly_token_limit,
            "errors": errors, "breakdown": [{"provider": r[0], "action": r[1], "requests": r[2], "prompt_tokens": int(r[3]),
                                            "completion_tokens": int(r[4])} for r in rows]}


@router.put("/usage/limit")
def set_limit(limit: int, workspace_id: uuid.UUID | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = resolve_workspace(db, user, workspace_id, "admin")
    ws.ai_monthly_token_limit = max(0, limit)
    db.commit()
    return {"monthly_limit": ws.ai_monthly_token_limit}


# ---------- generation ----------
def _do(body: AIGenerateIn, allowed: set, user, db) -> AIResult:
    _rate(user)
    if body.action not in allowed:
        raise HTTPException(422, f"Unknown action '{body.action}'. Allowed: {sorted(allowed)}")
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    if body.document_id:
        d = get_document_checked(db, user, body.document_id, "editor")
        body.params.setdefault("title", d.title)
        body.params.setdefault("report_type", d.report_type)
        body.params.setdefault("language", d.language)
    if "text" in body.params and len(str(body.params["text"])) > 60000:
        raise HTTPException(413, "Selected text too long (max 60k characters)")
    msgs = prompts.build_messages(body.action, body.params)
    res, cfg = run_chat(db, ws, user.id, body.document_id, body.provider_id, body.action, msgs, body.temperature, body.max_tokens)
    return AIResult(text=res.text.strip(), provider=cfg["name"], model=res.model, prompt_tokens=res.prompt_tokens,
                    completion_tokens=res.completion_tokens)


@router.post("/generate", response_model=AIResult)
def generate(body: AIGenerateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _do(body, WRITER | ANALYSIS, user, db)


@router.post("/rewrite", response_model=AIResult)
def rewrite(body: AIGenerateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _do(body, EDITOR, user, db)


@router.post("/analyze", response_model=AIResult)
def analyze(body: AIGenerateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _do(body, ANALYSIS, user, db)
    if body.action == "suggest_chart":
        m = re.search(r"\{.*\}", r.text, re.S)
        try:
            json.loads(m.group(0) if m else "")
            r.text = m.group(0)
        except (ValueError, AttributeError):
            raise HTTPException(502, "Model did not return a valid chart specification; try again")
    return r


# ---------- RAG ----------
@router.post("/sources/{aid}/embed")
def embed_source(aid: uuid.UUID, provider_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Create embeddings for an uploaded source's chunks using the provider's embedding model."""
    _rate(user)
    a = db.get(Asset, aid)
    if not a:
        raise HTTPException(404, "Asset not found")
    require_role(db, user, a.workspace_id, "editor")
    ws = resolve_workspace(db, user, a.workspace_id, "editor")
    cfg = provider_config(ws, provider_id)
    prov = build_provider(cfg)
    chunks = [dict(c) for c in a.chunks or []]
    try:
        for i in range(0, len(chunks), 32):
            vecs = prov.embed([c["text"] for c in chunks[i:i + 32]])
            for c, v in zip(chunks[i:i + 32], vecs):
                c["embedding"] = v
    except AIError as e:
        raise HTTPException(e.status, str(e))
    a.chunks = chunks
    db.commit()
    return {"chunks": len(chunks), "embedded": True, "provider": cfg["name"]}


@router.post("/research", response_model=AIResult)
def research(body: AIResearchIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _rate(user)
    ws = resolve_workspace(db, user, body.workspace_id, "editor")
    q = db.query(Asset).filter(Asset.workspace_id == ws.id, Asset.kind == "source")
    if body.asset_ids:
        q = q.filter(Asset.id.in_(body.asset_ids))
    assets = q.all()
    pool = [(a, c) for a in assets for c in (a.chunks or [])]
    if not pool:
        raise HTTPException(400, "No uploaded sources to search. Upload PDF/DOCX/TXT files first.")
    retrieval = "lexical"
    scores = None
    if all(c.get("embedding") for _, c in pool):
        try:
            cfg = provider_config(ws, body.provider_id)
            qv = build_provider(cfg).embed([body.question])[0]
            scores = [cosine(qv, c["embedding"]) for _, c in pool]
            scores = [x if x >= 0.2 else 0 for x in scores]  # drop clearly unrelated chunks
            retrieval = "semantic"
        except (AIError, HTTPException):
            scores = None
    if scores is None:
        scores = bm25_scores(body.question, [c["text"] for _, c in pool])
    ranked = sorted(zip(scores, pool), key=lambda x: -x[0])[:body.top_k]
    ranked = [r for r in ranked if r[0] > 0]
    if not ranked:
        msg = "لا تحتوي المصادر المرفوعة على هذه المعلومة." if body.language == "ar" else \
            "The provided sources do not contain this information."
        return AIResult(text=msg, provider="", model="", prompt_tokens=0, completion_tokens=0, sources=[], retrieval=retrieval)
    excerpts, srcs = [], []
    for i, (score, (a, c)) in enumerate(ranked, 1):
        sid = f"S{i}"
        excerpts.append(f"[{sid}] (file: {a.filename}, page {c.get('page', 1)})\n{c['text']}")
        srcs.append({"id": sid, "asset_id": str(a.id), "filename": a.filename, "page": c.get("page", 1),
                     "excerpt": c["text"][:500], "score": round(float(score), 4)})
    msgs = [{"role": "system", "content": prompts.RAG_SYSTEM.format(lang_name=prompts.LANG_NAMES[body.language])},
            {"role": "user", "content": "Sources:\n\n" + "\n\n".join(excerpts) + f"\n\nQuestion: {body.question}"}]
    res, cfg = run_chat(db, ws, user.id, body.document_id, body.provider_id, "research", msgs, 0.1, 1500)
    text, used = verify_citations(res.text, {s["id"] for s in srcs})
    return AIResult(text=text.strip(), provider=cfg["name"], model=res.model, prompt_tokens=res.prompt_tokens,
                    completion_tokens=res.completion_tokens, sources=[s for s in srcs if s["id"] in used],
                    retrieval=retrieval)
