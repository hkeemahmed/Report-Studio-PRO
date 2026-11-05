"""AI tests run the real adapters against an in-process HTTP mock of the provider APIs (no network)."""
import json

import httpx
import pytest

from app.ai import providers
from app.ai.rag import bm25_scores, chunk_pages, verify_citations


def fake_server(request: httpx.Request) -> httpx.Response:
    path = request.url.path
    if path.endswith("/chat/completions"):
        body = json.loads(request.content)
        assert request.headers["authorization"] == "Bearer sk-test"
        user_msg = body["messages"][-1]["content"]
        if "zzzz" in user_msg:
            text = "The provided sources do not contain this information."
        elif "Sources:" in user_msg:
            text = "تعلم الآلة فرع من الذكاء الاصطناعي [S1] وهذا ادعاء مختلق [S9]."
        elif "JSON" in user_msg:
            text = 'Here: {"type": "bar", "title": "t", "labels": ["a"], "series": [{"name": "s", "data": [1]}]}'
        else:
            text = "نص محسّن"
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": {"content": text}}],
                                         "usage": {"prompt_tokens": 50, "completion_tokens": 20}})
    if path.endswith("/models"):
        return httpx.Response(200, json={"data": [{"id": "gpt-4o-mini"}, {"id": "text-embedding-3-small"}]})
    if path.endswith("/embeddings"):
        inputs = json.loads(request.content)["input"]
        return httpx.Response(200, json={"data": [{"index": i, "embedding": [1.0 if "آلة" in t else 0.1, 0.5]}
                                                  for i, t in enumerate(inputs)]})
    if path == "/api/chat":
        return httpx.Response(200, json={"model": "llama3.1", "message": {"content": "local answer"},
                                         "prompt_eval_count": 10, "eval_count": 5})
    if path == "/api/tags":
        return httpx.Response(200, json={"models": [{"name": "llama3.1:latest"}]})
    return httpx.Response(404, json={"error": "not found"})


@pytest.fixture(autouse=True)
def mock_transport():
    providers.TRANSPORT_OVERRIDE = httpx.MockTransport(fake_server)
    yield
    providers.TRANSPORT_OVERRIDE = None


def add_openai(client, h, **kw):
    return client.post("/ai/providers", json={"name": "OpenAI", "type": "openai", "api_key": "sk-test",
                                              "model": "gpt-4o-mini", "embedding_model": "text-embedding-3-small", **kw},
                       headers=h).json()


def test_provider_management_never_returns_key(client, user):
    h = user["headers"]
    p = add_openai(client, h)
    assert p["has_api_key"] and "api_key" not in p and p["is_default"]
    listed = client.get("/ai/providers", headers=h).json()
    assert "sk-test" not in json.dumps(listed)
    o = client.post("/ai/providers", json={"name": "Local", "type": "ollama", "base_url": "http://localhost:11434",
                                           "model": "llama3.1", "is_default": True}, headers=h).json()
    assert [x["is_default"] for x in client.get("/ai/providers", headers=h).json()] == [False, True]
    t = client.post(f"/ai/providers/{o['id']}/test", headers=h).json()
    assert t["ok"] and t["models"] == ["llama3.1:latest"] and t["model_available"]
    assert client.post("/ai/providers", json={"name": "x", "type": "openai", "base_url": "ftp://x"}, headers=h).status_code == 422


def test_no_provider_gives_clear_error(client, user):
    r = client.post("/ai/rewrite", json={"action": "improve", "params": {"text": "x"}}, headers=user["headers"])
    assert r.status_code == 400 and "No AI provider" in r.json()["detail"]


def test_rewrite_generate_and_usage(client, user):
    h = user["headers"]
    p = add_openai(client, h)
    d = client.post("/documents", json={"title": "تقرير"}, headers=h).json()
    r = client.post("/ai/rewrite", json={"action": "improve", "document_id": d["id"], "params": {"text": "نص"}}, headers=h)
    assert r.status_code == 200 and r.json()["text"] == "نص محسّن" and r.json()["prompt_tokens"] == 50
    assert client.post("/ai/rewrite", json={"action": "full_report", "params": {}}, headers=h).status_code == 422
    g = client.post("/ai/generate", json={"action": "introduction", "params": {"title": "AI"}, "provider_id": p["id"]}, headers=h)
    assert g.status_code == 200
    chart = client.post("/ai/analyze", json={"action": "suggest_chart", "params": {"text": "a=1"}}, headers=h).json()
    assert json.loads(chart["text"])["type"] == "bar"
    u = client.get("/ai/usage", headers=h).json()
    assert u["tokens_this_month"] == 210
    # limits enforced
    client.put("/ai/usage/limit?limit=100", headers=h)
    assert client.post("/ai/rewrite", json={"action": "improve", "params": {"text": "x"}}, headers=h).status_code == 429


def test_ollama_local(client, user):
    h = user["headers"]
    client.post("/ai/providers", json={"name": "Local", "type": "ollama", "model": "llama3.1"}, headers=h)
    r = client.post("/ai/rewrite", json={"action": "summarize", "params": {"text": "abc"}}, headers=h).json()
    assert r["text"] == "local answer" and r["provider"] == "Local"


def test_provider_unreachable_is_logged(client, user):
    h = user["headers"]
    providers.TRANSPORT_OVERRIDE = httpx.MockTransport(lambda r: (_ for _ in ()).throw(httpx.ConnectError("down")))
    client.post("/ai/providers", json={"name": "Local", "type": "ollama"}, headers=h)
    r = client.post("/ai/rewrite", json={"action": "summarize", "params": {"text": "abc"}}, headers=h)
    assert r.status_code == 502 and "Cannot reach" in r.json()["detail"]
    assert client.get("/ai/usage", headers=h).json()["errors"] == 1


def test_rag_upload_retrieve_and_verified_citations(client, user):
    h = user["headers"]
    add_openai(client, h)
    text = ("تعلم الآلة هو فرع من فروع الذكاء الاصطناعي يهتم ببناء أنظمة تتعلم من البيانات. " * 3 +
            "\n\nThe Eiffel Tower is located in Paris.").encode()
    up = client.post("/assets", files={"file": ("notes.txt", text, "text/plain")}, data={"kind": "source"}, headers=h)
    assert up.status_code == 201 and up.json()["chunk_count"] >= 1
    aid = up.json()["id"]
    # lexical retrieval works before embeddings exist
    r = client.post("/ai/research", json={"question": "ما هو تعلم الآلة؟"}, headers=h).json()
    assert r["retrieval"] == "lexical"
    assert "[S9]" not in r["text"] and "[S1]" in r["text"]  # invented citation removed
    assert r["sources"][0]["filename"] == "notes.txt"
    # semantic retrieval after embedding
    e = client.post(f"/ai/sources/{aid}/embed", headers=h).json()
    assert e["embedded"]
    r2 = client.post("/ai/research", json={"question": "تعلم الآلة"}, headers=h).json()
    assert r2["retrieval"] == "semantic"
    # unrelated question: no fabricated answer
    r3 = client.post("/ai/research", json={"question": "zzzz qqqq", "language": "en"}, headers=h).json()
    assert r3["text"] == "The provided sources do not contain this information." and r3["sources"] == []


def test_rag_helpers():
    chunks = chunk_pages([(1, "a. " * 1000)], size=200, overlap=20)
    assert all(len(c["text"]) <= 200 for c in chunks) and len(chunks) > 5
    s = bm25_scores("الذكاء", ["الذكاء الاصطناعي", "كرة القدم"])
    assert s[0] > 0 and s[1] == 0
    assert verify_citations("x [S1] y [S4]", {"S1"}) == ("x [S1] y ", ["S1"])
