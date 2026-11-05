"""Verify the DOCX/PDF produced by the E2E run preserve content and formatting.
Usage: python tests/e2e/verify_exports.py <outDir>"""
import sys
import zipfile

import pdfplumber
from docx import Document

out = sys.argv[1]
d = Document(f"{out}/report.docx")
texts = [p.text for p in d.paragraphs]
assert "تقرير عن تطبيقات الذكاء الاصطناعي في الطب" in texts, "cover title"
assert any(r.bold and r.text.startswith("يشهد العالم") for p in d.paragraphs for r in p.runs), "bold Arabic run"
assert any("Mixed English sentence" in t for t in texts), "mixed text"
order = [i for i, t in enumerate(texts) if t.startswith("يشهد العالم") or t == "المراجع"]
assert len(order) == 2 and texts[order[0]].startswith("يشهد"), "body text precedes the references section"
rows = [[c.text for c in r.cells] for r in d.tables[0].rows]
assert rows == [["العينة", "الدقة", "التصوير الطبي"], ["94%", "", ""]], rows
assert "شكل 1: مخطط توضيحي للنظام" in texts, "auto-numbered figure caption"
assert len(d.inline_shapes) == 1, "embedded image"
xml = zipfile.ZipFile(f"{out}/report.docx").read("word/document.xml").decode()
assert "<w:bidi/>" in xml and "<w:bidiVisual/>" in xml, "RTL paragraphs and RTL table"
assert d.sections[0].footer._element.xml.count("PAGE") >= 1, "page number field"
pdf = pdfplumber.open(f"{out}/report.pdf")
assert len(pdf.pages) >= 4, len(pdf.pages)  # cover, TOC, body (1+ pages), references
body = "\n".join(p.extract_text() for p in pdf.pages[2:-1])  # body pages only: content must come before the references page
assert "GPT-4" in body and "94%" in body and "Mixed English sentence" in body, body[:300]
fonts = {c["fontname"].split("+")[-1] for p in pdf.pages for c in p.chars}
assert fonts <= {"Amiri-Regular", "Amiri-Bold", "Amiri-Italic"}, fonts
z = zipfile.ZipFile(f"{out}/report.odt")
assert z.read("mimetype") == b"application/vnd.oasis.opendocument.text"
odt = z.read("content.xml").decode()
assert "التصوير الطبي" in odt and "94%" in odt and 'style:writing-mode="rl-tb"' in odt, "ODT content + RTL"
print("EXPORTS VERIFIED (ODT too):: DOCX (structure, bold, RTL, table, image, caption, page numbers) + PDF (cover/TOC/body/references pages, embedded Amiri, content)")
