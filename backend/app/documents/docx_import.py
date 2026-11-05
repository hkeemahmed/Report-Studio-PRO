"""DOCX -> Tiptap JSON importer: headings, paragraphs (alignment, bidi), bold/italic/underline/color,
lists, tables and inline images."""
import base64
import io

from docx import Document as DocxDocument
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

ALIGN = {0: "left", 1: "center", 2: "right", 3: "justify"}


def _runs(p: Paragraph, doc) -> list[dict]:
    out = []
    for r in p.runs:
        for blip in r._r.findall(".//" + qn("a:blip")):
            rid = blip.get(qn("r:embed"))
            part = doc.part.related_parts.get(rid)
            if part is not None:
                out.append({"__image__": "data:" + part.content_type + ";base64," + base64.b64encode(part.blob).decode()})
        if not r.text:
            continue
        marks = []
        if r.bold: marks.append({"type": "bold"})
        if r.italic: marks.append({"type": "italic"})
        if r.underline: marks.append({"type": "underline"})
        if r.font.strike: marks.append({"type": "strike"})
        if r.font.superscript: marks.append({"type": "superscript"})
        if r.font.subscript: marks.append({"type": "subscript"})
        style = {}
        if r.font.color is not None and r.font.color.type is not None and r.font.color.rgb is not None:
            style["color"] = f"#{r.font.color.rgb}"
        if r.font.size:
            style["fontSize"] = f"{r.font.size.pt:g}pt"
        if style:
            marks.append({"type": "textStyle", "attrs": style})
        node = {"type": "text", "text": r.text}
        if marks:
            node["marks"] = marks
        out.append(node)
    return out


def _para(p: Paragraph, doc) -> list[dict]:
    runs = _runs(p, doc)
    images = [r["__image__"] for r in runs if "__image__" in r]
    inline = [r for r in runs if "__image__" not in r]
    attrs = {}
    if p.alignment is not None and int(p.alignment) in ALIGN:
        attrs["textAlign"] = ALIGN[int(p.alignment)]
    pPr = p._p.pPr
    if pPr is not None and pPr.find(qn("w:bidi")) is not None:
        attrs["dir"] = "rtl"
    style = (p.style.name if p.style is not None else "") or ""
    nodes = []
    if style.startswith("Heading") and style[-1:].isdigit():
        nodes.append({"type": "heading", "attrs": {**attrs, "level": min(6, int(style[-1]))}, "content": inline})
    elif style == "Title":
        nodes.append({"type": "heading", "attrs": {**attrs, "level": 1}, "content": inline})
    elif inline or not images:
        nodes.append({"type": "paragraph", "attrs": attrs, "content": inline} if inline else {"type": "paragraph", "attrs": attrs})
    for src in images:
        nodes.append({"type": "image", "attrs": {"src": src}})
    if "List" in style:
        kind = "orderedList" if "Number" in style else "bulletList"
        return [{"__list__": kind, "node": n} for n in nodes]
    return nodes


def _table(t: Table, doc) -> dict:
    rows = []
    for ri, row in enumerate(t.rows):
        cells, seen = [], set()
        for c in row.cells:
            if id(c._tc) in seen:
                continue
            seen.add(id(c._tc))
            span = c._tc.grid_span if hasattr(c._tc, "grid_span") else 1
            content = [n for p in c.paragraphs for n in _para(p, doc) if "__list__" not in n] or [{"type": "paragraph"}]
            cell = {"type": "tableHeader" if ri == 0 else "tableCell", "content": content}
            if span > 1:
                cell["attrs"] = {"colspan": span}
            cells.append(cell)
        rows.append({"type": "tableRow", "content": cells})
    return {"type": "table", "content": rows}


def import_docx(data: bytes) -> tuple[str, dict]:
    doc = DocxDocument(io.BytesIO(data))
    content, list_buf, list_kind = [], [], None

    def flush():
        nonlocal list_buf, list_kind
        if list_buf:
            content.append({"type": list_kind, "content": [{"type": "listItem", "content": [n]} for n in list_buf]})
        list_buf, list_kind = [], None

    body = doc.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            for n in _para(Paragraph(child, doc), doc):
                if "__list__" in n:
                    if list_kind and list_kind != n["__list__"]:
                        flush()
                    list_kind = n["__list__"]
                    list_buf.append(n["node"])
                else:
                    flush()
                    content.append(n)
        elif child.tag == qn("w:tbl"):
            flush()
            content.append(_table(Table(child, doc), doc))
    flush()
    title = doc.core_properties.title or next(
        (c["content"][0]["text"] for c in content if c["type"] == "heading" and c.get("content")), "Imported document")
    return title[:300], {"type": "doc", "content": content or [{"type": "paragraph"}]}
