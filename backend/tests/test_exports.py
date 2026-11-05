import io
import zipfile

import pdfplumber
from docx import Document as Docx

from app.exports.bidi import reorder_line, visual_word
from app.exports.pdf_export import Tok

from .fixtures import SOURCE, arabic_report


def _setup(client, h, layout=None):
    src = client.post("/references", json=SOURCE, headers=h).json()
    content = arabic_report(src["id"])
    d = client.post("/documents", json={"title": "تقرير الذكاء الاصطناعي", "language": "ar", "content": content,
                                        "layout": {"header": {"text": "{title}"}, **(layout or {})},
                                        "metadata": {"author": "أحمد علي"}}, headers=h).json()
    return d


def test_docx_export_preserves_structure_and_rtl(client, user):
    h = user["headers"]
    d = _setup(client, h)
    r = client.post("/exports/docx", json={"document_id": d["id"]}, headers=h)
    assert r.status_code == 200
    assert "filename*=UTF-8''" in r.headers["content-disposition"]
    doc = Docx(io.BytesIO(r.content))
    texts = [p.text for p in doc.paragraphs]
    assert "المقدمة" in texts and "Methodology" in texts
    assert any(p.text == "المقدمة" and p.style.name == "Heading 1" for p in doc.paragraphs)
    xml = zipfile.ZipFile(io.BytesIO(r.content)).read("word/document.xml").decode()
    assert "<w:bidi/>" in xml and "<w:rtl/>" in xml and "<w:bidiVisual/>" in xml  # RTL paragraphs, runs, table
    assert 'w:gridSpan w:val="2"' in xml  # merged cell
    assert "FEF3C7" in xml  # cell color
    assert "TOC \\o" in xml  # real TOC field
    body = "\n".join(texts)
    assert "(LeCun et al., 2015)" in body  # in-text citation APA
    assert "LeCun, Y., Bengio, Y., & Hinton, G. (2015)." in body  # bibliography entry
    assert "جدول 1: نتائج التجربة" in body and "شكل 1: مخطط توضيحي" in body
    assert len(doc.tables) == 1 and doc.tables[0].cell(1, 1).text == "12.5"
    assert len(doc.inline_shapes) == 1
    sec = doc.sections[0]
    assert round(sec.page_width.mm) == 210 and round(sec.left_margin.mm) == 25
    footer_xml = sec.footer._element.xml
    assert "PAGE" in footer_xml
    assert "تقرير الذكاء الاصطناعي" in sec.header.paragraphs[0].text
    assert doc.core_properties.author == "أحمد علي"


def test_docx_landscape_letter_columns(client, user):
    h = user["headers"]
    d = _setup(client, h, {"pageSize": "Letter", "orientation": "landscape", "columns": 2, "pageBorder": True})
    r = client.post("/exports/docx", json={"document_id": d["id"]}, headers=h)
    doc = Docx(io.BytesIO(r.content))
    s = doc.sections[0]
    assert s.page_width > s.page_height and round(s.page_width.mm) == 279
    xml = s._sectPr.xml
    assert 'w:num="2"' in xml and "pgBorders" in xml


def test_pdf_export_arabic_fonts_pages(client, user):
    h = user["headers"]
    d = _setup(client, h)
    r = client.post("/exports/pdf", json={"document_id": d["id"]}, headers=h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    pdf = pdfplumber.open(io.BytesIO(r.content))
    assert len(pdf.pages) == 3  # cover, body, bibliography
    w, hgt = pdf.pages[0].width, pdf.pages[0].height
    assert round(w) == 595 and round(hgt) == 842  # A4
    fonts = {c["fontname"] for p in pdf.pages for c in p.chars}
    assert any("RSP" in f or "Amiri" in f for f in fonts)  # embedded TTF
    page2 = pdf.pages[1].extract_text()
    # Arabic is shaped into presentation forms (contextual glyphs), Latin intact
    assert any(0xFE70 <= ord(ch) <= 0xFEFF for ch in page2)
    assert "Methodology" in page2 and "GPT-4" in page2 and "12.5" in page2
    assert "(LeCun et al., 2015)" in page2
    # page number in footer on body page (cover excluded), header shows title
    assert page2.strip().splitlines()[-1].strip() == "1"
    assert "LeCun, Y., Bengio, Y., & Hinton, G. (2015)." in pdf.pages[2].extract_text()
    # footnote rendered at the bottom of the page that references it (page 2), not in an end section
    words = pdf.pages[1].extract_words()
    note = [w for w in words if "1." in w["text"]]
    assert note and max(w["top"] for w in note) > pdf.pages[1].height * 0.8


def test_pdf_unsaved_content_print_preview(client, user):
    h = user["headers"]
    d = client.post("/documents", json={"title": "Preview", "language": "en"}, headers=h).json()
    content = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Live preview text"}]}]}
    r = client.post("/exports/pdf", json={"document_id": d["id"], "content": content}, headers=h)
    assert "Live preview text" in pdfplumber.open(io.BytesIO(r.content)).pages[0].extract_text()


def test_html_md_txt_exports(client, user):
    h = user["headers"]
    d = _setup(client, h)
    html = client.post("/exports/html", json={"document_id": d["id"]}, headers=h).text
    assert 'dir="rtl"' in html and "@page" in html and "<table>" in html and 'colspan="2"' in html
    md = client.post("/exports/md", json={"document_id": d["id"]}, headers=h).text
    assert "# المقدمة" in md and "| العينة | القيمة |" in md and "[^1]: هامش توضيحي" in md
    txt = client.post("/exports/txt", json={"document_id": d["id"]}, headers=h).text
    assert "يعد الذكاء الاصطناعي" in txt
    assert client.post("/exports/exe", json={"document_id": d["id"]}, headers=h).status_code == 404


def test_bidi_word_order():
    # "مرحبا 2024 world" in RTL: Arabic word rightmost, LTR run "2024 world" stays in LTR order
    toks = [Tok("مرحبا"), Tok(" "), Tok("2024"), Tok(" "), Tok("world")]
    vis = [t.text for t, _ in reorder_line(toks, True)]
    assert vis == ["2024", " ", "world", " ", "مرحبا"]
    # brackets are mirrored in RTL words, digits keep order
    assert visual_word("(نص)", True).startswith("(")
    assert "123" in visual_word("رقم123", True)


def test_tracked_deletions_excluded_from_exports(client, user):
    h = user["headers"]
    content = {"type": "doc", "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "keep "}, {"type": "text", "text": "REMOVED", "marks": [{"type": "deletion"}]},
        {"type": "text", "text": "added", "marks": [{"type": "insertion"}]}]}]}
    d = client.post("/documents", json={"title": "tc", "content": content, "language": "en"}, headers=h).json()
    for fmt in ("txt", "md", "html"):
        body = client.post(f"/exports/{fmt}", json={"document_id": d["id"]}, headers=h).text
        assert "REMOVED" not in body and "added" in body
    doc = Docx(io.BytesIO(client.post("/exports/docx", json={"document_id": d["id"]}, headers=h).content))
    assert doc.paragraphs[0].text == "keep added"
    pdf = client.post("/exports/pdf", json={"document_id": d["id"]}, headers=h).content
    assert "REMOVED" not in pdfplumber.open(io.BytesIO(pdf)).pages[0].extract_text()


def test_pdf_no_blank_page_from_trailing_empty_paragraph():
    from app.exports.context import ExportContext
    from app.exports.pdf_export import export_pdf
    filler = [{"type": "paragraph", "content": [{"type": "text", "text": "سطر نصي تجريبي " * 8}]} for _ in range(26)]
    c = {"type": "doc", "content": filler + [{"type": "paragraph"}, {"type": "pageBreak"}, {"type": "bibliography"}]}
    pdf = pdfplumber.open(io.BytesIO(export_pdf(ExportContext("x", c, {}, "ar"))))
    assert all(p.extract_text().strip() for p in pdf.pages), "no empty pages"


def test_docx_native_footnotes_and_equations(client, user):
    h = user["headers"]
    d = _setup(client, h)
    r = client.post("/exports/docx", json={"document_id": d["id"]}, headers=h)
    z = zipfile.ZipFile(io.BytesIO(r.content))
    doc_xml = z.read("word/document.xml").decode()
    assert 'w:footnoteReference w:id="1"' in doc_xml
    assert "هامش توضيحي" in z.read("word/footnotes.xml").decode()
    assert "footnotes.xml" in z.read("word/_rels/document.xml.rels").decode()
    assert "<m:oMathPara" in doc_xml and "<m:sSup>" in doc_xml  # E = mc^2 as native Word math
    assert "Notes" not in doc_xml and "الهوامش" not in doc_xml


def test_odt_export(client, user):
    h = user["headers"]
    d = _setup(client, h)
    r = client.post("/exports/odt", json={"document_id": d["id"]}, headers=h)
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert z.namelist()[0] == "mimetype" and z.read("mimetype") == b"application/vnd.oasis.opendocument.text"
    c = z.read("content.xml").decode()
    assert 'style:writing-mode="rl-tb"' in c and "<table:table " in c and 'table:number-columns-spanned="2"' in c
    assert '<text:note text:id="ftn1"' in c and "(LeCun et al., 2015)" in c and "شكل 1: مخطط توضيحي" in c
    assert any(n.startswith("Pictures/") for n in z.namelist())
    assert "text:page-number" in z.read("styles.xml").decode()


def test_background_export_job(client, user):
    h = user["headers"]
    d = _setup(client, h)
    j = client.post("/exports/jobs?fmt=docx", json={"document_id": d["id"]}, headers=h)
    assert j.status_code == 202
    st = client.get(f"/exports/jobs/{j.json()['job_id']}", headers=h).json()
    assert st["status"] == "done" and st["size_bytes"] > 5000  # eager mode (no broker configured)
    f = client.get(f"/exports/jobs/{j.json()['job_id']}/file", headers=h)
    assert f.status_code == 200 and Docx(io.BytesIO(f.content)).paragraphs


def test_page_thumbnails(client, user):
    h = user["headers"]
    d = _setup(client, h)
    r = client.post("/exports/pages?scale=0.3", json={"document_id": d["id"]}, headers=h).json()
    assert r["count"] == 3 and len(r["pages"]) == 3 and r["pages"][0].startswith("data:image/png;base64,")
