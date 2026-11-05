import io
import uuid

from docx import Document as Docx

from .fixtures import arabic_report, png_data_uri


def test_upload_validation(client, user):
    h = user["headers"]
    import base64
    png = base64.b64decode(png_data_uri().split(",")[1])
    ok = client.post("/assets", files={"file": ("a.png", png, "image/png")}, data={"kind": "image"}, headers=h)
    assert ok.status_code == 201 and ok.json()["mime_type"] == "image/png"
    assert client.get(f"/assets/{ok.json()['id']}/content", headers=h).content == png
    # disguised executable rejected even with image content-type
    bad = client.post("/assets", files={"file": ("evil.png", b"MZ\x90\x00fake", "image/png")}, data={"kind": "image"}, headers=h)
    assert bad.status_code == 415
    # path traversal filename is neutralised
    t = client.post("/assets", files={"file": ("../../etc/x.txt", b"hello", "text/plain")}, data={"kind": "source"}, headers=h)
    assert t.status_code == 201 and t.json()["filename"] == "x.txt"


def test_docx_source_extraction_and_import(client, user):
    h = user["headers"]
    d = Docx()
    d.add_heading("عنوان رئيسي", 1)
    p = d.add_paragraph()
    p.add_run("نص ").bold = True
    p.add_run("عادي")
    d.add_paragraph("بند", style="List Bullet")
    tbl = d.add_table(rows=2, cols=2)
    tbl.cell(0, 0).text, tbl.cell(1, 1).text = "رأس", "قيمة"
    buf = io.BytesIO()
    d.save(buf)
    data = buf.getvalue()
    up = client.post("/assets", files={"file": ("s.docx", data, "application/octet-stream")}, data={"kind": "source"}, headers=h)
    assert up.status_code == 201
    assert "عنوان رئيسي" in client.get(f"/assets/{up.json()['id']}/text", headers=h).json()["text"]
    imp = client.post("/documents/import", files={"file": ("s.docx", data)}, headers=h)
    assert imp.status_code == 201, imp.text
    c = imp.json()["content"]["content"]
    assert c[0] == {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "عنوان رئيسي"}]}
    assert c[1]["content"][0]["marks"] == [{"type": "bold"}]
    assert c[2]["type"] == "bulletList" and c[3]["type"] == "table"
    assert imp.json()["language"] == "ar"


def test_sync_push_pull_conflict_idempotent(client, user):
    h = user["headers"]
    did = str(uuid.uuid4())
    # offline-created doc pushed later
    r = client.post("/sync/push", json={"device_id": "desktop-1", "operations": [
        {"client_op_id": "op1", "entity_type": "document", "entity_id": did, "op": "upsert", "base_version": 0,
         "data": {"title": "تقرير دون اتصال", "content": arabic_report()}}]}, headers=h).json()
    assert r["results"][0]["status"] == "applied" and r["results"][0]["version"] == 1
    # replay is idempotent
    again = client.post("/sync/push", json={"device_id": "desktop-1", "operations": [
        {"client_op_id": "op1", "entity_type": "document", "entity_id": did, "op": "upsert", "base_version": 0, "data": {}}]},
        headers=h).json()
    assert again["results"][0]["status"] == "duplicate"
    t0 = r["server_time"]
    # web edits the doc -> v2
    client.put(f"/documents/{did}", json={"base_version": 1, "title": "تعديل الويب"}, headers=h)
    # desktop pushes an edit based on v1 -> conflict, server copy untouched
    c = client.post("/sync/push", json={"device_id": "desktop-1", "operations": [
        {"client_op_id": "op2", "entity_type": "document", "entity_id": did, "op": "upsert", "base_version": 1,
         "data": {"title": "تعديل سطح المكتب"}}]}, headers=h).json()["results"][0]
    assert c["status"] == "conflict" and c["server_version"] == 2 and c["server"]["title"] == "تعديل الويب"
    assert "diff" in c
    assert client.get(f"/documents/{did}", headers=h).json()["title"] == "تعديل الويب"
    # resolve: keep mine by re-basing on v2
    res = client.post("/sync/push", json={"device_id": "desktop-1", "operations": [
        {"client_op_id": "op3", "entity_type": "document", "entity_id": did, "op": "upsert", "base_version": 2,
         "data": {"title": "تعديل سطح المكتب"}}]}, headers=h).json()["results"][0]
    assert res["status"] == "applied" and res["version"] == 3
    # pull since t0 returns the changed doc
    pulled = client.post("/sync/pull", json={"device_id": "desktop-1", "since": t0}, headers=h).json()
    assert [d["id"] for d in pulled["documents"]] == [did]
    # stale delete rejected, correct delete applied and reported in pull
    stale = client.post("/sync/push", json={"device_id": "d", "operations": [
        {"client_op_id": "x1", "entity_type": "document", "entity_id": did, "op": "delete", "base_version": 1}]}, headers=h).json()
    assert stale["results"][0]["status"] == "conflict"
    client.post("/sync/push", json={"device_id": "d", "operations": [
        {"client_op_id": "x2", "entity_type": "document", "entity_id": did, "op": "delete", "base_version": 3}]}, headers=h)
    pulled = client.post("/sync/pull", json={"device_id": "desktop-1", "since": t0}, headers=h).json()
    assert did in pulled["deleted"] and pulled["documents"] == []


def test_review_checks(client, user):
    h = user["headers"]
    content = {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "المقدمة"}]},
        {"type": "paragraph", "content": [{"type": "text", "text": "هذا هذا نص  فيه تكرار ، وخطأ؟ هل هو صحيح ?"}]},
        {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "فارغ"}]}]}
    d = client.post("/documents", json={"title": "r", "content": content}, headers=h).json()
    r = client.get(f"/documents/{d['id']}/review", headers=h).json()
    types = {i["type"] for i in r["issues"]}
    assert {"repeated_word", "double_space", "space_before_punctuation", "missing_section", "empty_section"} <= types
    assert 0 <= r["score"] < 10 and "Plagiarism" in r["note"]


def test_similarity_against_own_corpus(client, user):
    h = user["headers"]
    src = "تعلم الآلة هو فرع من فروع الذكاء الاصطناعي يهتم ببناء أنظمة قادرة على التعلم من البيانات وتحسين أدائها مع الوقت"
    client.post("/assets", files={"file": ("ml.txt", src.encode(), "text/plain")}, data={"kind": "source"}, headers=h)
    body = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "مقدمة خاصة بي. " + src + " ثم خاتمة مختلفة تماماً عن المصدر."}]}]}
    d = client.post("/documents", json={"title": "s", "content": body}, headers=h).json()
    r = client.get(f"/documents/{d['id']}/similarity", headers=h).json()
    assert r["matches"][0]["title"] == "ml.txt" and 50 < r["overall_percent"] < 100
    assert "تعلم الآلة هو فرع" in r["matches"][0]["passages"][0]
    clean = client.post("/documents", json={"title": "c", "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "نص أصلي لا يشبه أي شيء آخر في هذه المساحة على الإطلاق هنا"}]}]}}, headers=h).json()
    assert client.get(f"/documents/{clean['id']}/similarity", headers=h).json()["overall_percent"] == 0
