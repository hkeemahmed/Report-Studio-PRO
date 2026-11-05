from .fixtures import arabic_report


def test_project_crud(client, user):
    h = user["headers"]
    p = client.post("/projects", json={"name": "مشروع التخرج", "category": "graduation"}, headers=h).json()
    assert p["name"] == "مشروع التخرج"
    assert client.put(f"/projects/{p['id']}", json={"is_favorite": True}, headers=h).json()["is_favorite"]
    assert [x["id"] for x in client.get("/projects?q=التخرج", headers=h).json()] == [p["id"]]
    client.put(f"/projects/{p['id']}", json={"is_archived": True}, headers=h)
    assert client.get("/projects", headers=h).json() == []
    assert len(client.get("/projects?archived=true", headers=h).json()) == 1
    f = client.post("/folders", json={"project_id": p["id"], "name": "الفصل الأول"}, headers=h)
    assert f.status_code == 201
    assert client.delete(f"/projects/{p['id']}", headers=h).status_code == 204


def test_document_lifecycle_versions_and_conflict(client, user):
    h = user["headers"]
    d = client.post("/documents", json={"title": "تقرير", "template_slug": "academic", "language": "ar"}, headers=h).json()
    assert d["version"] == 1 and d["layout"]["direction"] == "rtl" and d["layout"]["headingColor"] == "#1e3a8a"
    r = client.put(f"/documents/{d['id']}", json={"base_version": 1, "content": arabic_report(), "create_version": True,
                                                  "version_label": "draft 1"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2
    # stale write must be rejected, not silently overwrite
    stale = client.put(f"/documents/{d['id']}", json={"base_version": 1, "title": "x"}, headers=h)
    assert stale.status_code == 409 and stale.json()["detail"]["server_version"] == 2
    # reopen: content preserved exactly
    got = client.get(f"/documents/{d['id']}", headers=h).json()
    assert got["content"] == arabic_report()
    secs = client.get(f"/documents/{d['id']}/sections", headers=h).json()
    assert [s["heading"] for s in secs] == ["المقدمة", "Methodology"]
    vers = client.get(f"/documents/{d['id']}/versions", headers=h).json()
    assert [v["version"] for v in vers] == [2, 1]
    cmp = client.get(f"/documents/{d['id']}/compare?a=1&b=2", headers=h).json()
    assert cmp["stats"]["inserted"] > 0
    restored = client.post(f"/documents/{d['id']}/versions/1/restore", headers=h).json()
    assert restored["version"] == 3 and restored["content"] == {"type": "doc", "content": [{"type": "paragraph"}]}
    # search by body text
    client.put(f"/documents/{d['id']}", json={"base_version": 3, "content": arabic_report()}, headers=h)
    assert len(client.get("/documents?q=الاصطناعي", headers=h).json()) == 1


def test_invalid_content_rejected(client, user):
    h = user["headers"]
    bad = {"type": "doc", "content": [{"type": "script", "text": "x"}]}
    assert client.post("/documents", json={"title": "x", "content": bad}, headers=h).status_code == 422
    img = {"type": "doc", "content": [{"type": "image", "attrs": {"src": "javascript:alert(1)"}}]}
    assert client.post("/documents", json={"title": "x", "content": img}, headers=h).status_code == 422
    assert client.post("/documents", json={"title": "x", "layout": {"margins_mm": {"top": 500}}}, headers=h).status_code == 422


def test_tags_comments_favorites_duplicate(client, user):
    h = user["headers"]
    d = client.post("/documents", json={"title": "Doc"}, headers=h).json()
    assert client.put(f"/documents/{d['id']}/tags", json={"tags": ["ai", "lab", "ai"]}, headers=h).json() == ["ai", "lab"]
    assert len(client.get("/documents?tag=lab", headers=h).json()) == 1
    c = client.post(f"/documents/{d['id']}/comments", json={"body": "راجع هذه الفقرة", "anchor_text": "x"}, headers=h).json()
    assert client.put(f"/documents/{d['id']}/comments/{c['id']}?resolved=true", headers=h).json()["resolved"]
    client.put(f"/documents/{d['id']}", json={"base_version": 1, "is_favorite": True, "status": "completed"}, headers=h)
    dash = client.get("/dashboard", headers=h).json()
    assert dash["total_reports"] == 1 and dash["completed"] == 1 and len(dash["favorites"]) == 1
    dup = client.post(f"/documents/{d['id']}/duplicate", headers=h)
    assert dup.status_code == 201 and dup.json()["title"] == "Doc (copy)"


def test_workspace_isolation_and_rbac(client, user, other):
    d = client.post("/documents", json={"title": "Private"}, headers=user["headers"]).json()
    # other user cannot see or edit
    assert client.get(f"/documents/{d['id']}", headers=other["headers"]).status_code == 404
    assert client.put(f"/documents/{d['id']}", json={"base_version": 1, "title": "hack"}, headers=other["headers"]).status_code == 404
    assert client.get(f"/documents?workspace_id={user['ws']}", headers=other["headers"]).status_code == 404
    # grant viewer: can read and comment, not edit
    r = client.post(f"/workspaces/{user['ws']}/members", json={"email": other["email"], "role": "viewer"}, headers=user["headers"])
    assert r.status_code == 201
    assert client.get(f"/documents/{d['id']}", headers=other["headers"]).status_code == 200
    assert client.put(f"/documents/{d['id']}", json={"base_version": 1, "title": "x"}, headers=other["headers"]).status_code == 403
    assert client.post(f"/documents/{d['id']}/comments", json={"body": "ok"}, headers=other["headers"]).status_code == 201
    # viewer cannot add members
    assert client.post(f"/workspaces/{user['ws']}/members", json={"email": other["email"], "role": "admin"},
                       headers=other["headers"]).status_code == 403
    # promote to editor
    client.post(f"/workspaces/{user['ws']}/members", json={"email": other["email"], "role": "editor"}, headers=user["headers"])
    assert client.put(f"/documents/{d['id']}", json={"base_version": 1, "title": "Shared"}, headers=other["headers"]).status_code == 200


def test_templates_builtin_and_custom(client, user):
    h = user["headers"]
    tpls = client.get("/templates", headers=h).json()
    cats = {t["category"] for t in tpls if t["is_builtin"]}
    assert {"academic", "scientific", "engineering", "medical", "technical", "cybersecurity", "business", "financial",
            "school", "research", "graduation", "laboratory"} <= cats
    lab = next(t for t in tpls if t["slug"] == "laboratory")
    assert lab["styles"]["heading1"]["color"] and lab["structure"][0]["ar"] == "الهدف من التجربة"
    custom = client.post("/templates", json={"name": "My Uni", "structure": [{"ar": "مقدمة", "en": "Intro"}],
                                             "layout": {"headingColor": "#ff0000"}, "styles": {"heading1": {"color": "#ff0000"}}},
                         headers=h)
    assert custom.status_code == 201
    assert client.put(f"/templates/{lab['id']}", json={"name": "x"}, headers=h).status_code == 400
    assert client.delete(f"/templates/{custom.json()['id']}", headers=h).status_code == 204
