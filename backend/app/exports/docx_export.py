"""Dedicated DOCX export engine: Tiptap JSON + layout -> .docx with RTL, tables, images, headers/footers."""
import io
import re

from docx import Document as DocxDocument
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

from ..documents.schema import is_deleted as _deleted, detect_direction, node_text, page_dims_mm
from .context import ExportContext, decode_data_uri, split_italic_markers

ALIGN = {"left": WD_ALIGN_PARAGRAPH.LEFT, "right": WD_ALIGN_PARAGRAPH.RIGHT, "center": WD_ALIGN_PARAGRAPH.CENTER,
         "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}


def _hex(color: str) -> RGBColor | None:
    m = re.match(r"^#?([0-9a-fA-F]{6})$", (color or "").strip())
    return RGBColor.from_string(m.group(1).upper()) if m else None


def _el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn(k), str(v))
    return e


def _set_para_bidi(p, rtl: bool):
    pPr = p._p.get_or_add_pPr()
    for old in pPr.findall(qn("w:bidi")):
        pPr.remove(old)
    if rtl:
        pPr.insert(0, _el("w:bidi"))


def _font_run(run, family: str | None, size: float | None, rtl: bool):
    rPr = run._r.get_or_add_rPr()
    if family:
        fonts = rPr.find(qn("w:rFonts"))
        if fonts is None:
            fonts = _el("w:rFonts")
            rPr.insert(0, fonts)
        for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            fonts.set(qn(a), family)
    if size:
        run.font.size = Pt(size)
        rPr.append(_el("w:szCs", **{"w:val": int(size * 2)}))
    if rtl:
        rPr.append(_el("w:rtl"))


def _field(paragraph, instr: str, placeholder: str = "1"):
    r = paragraph.add_run()._r
    r.append(_el("w:fldChar", **{"w:fldCharType": "begin"}))
    it = _el("w:instrText", **{"xml:space": "preserve"})
    it.text = f" {instr} "
    r.append(it)
    r.append(_el("w:fldChar", **{"w:fldCharType": "separate"}))
    t = OxmlElement("w:t")
    t.text = placeholder
    r.append(t)
    r.append(_el("w:fldChar", **{"w:fldCharType": "end"}))


class DocxExporter:
    def __init__(self, ctx: ExportContext):
        self.ctx = ctx
        self.lay = ctx.layout
        self.doc = DocxDocument()
        self.base_font = self.lay.get("fontFamily", "Amiri")
        self.base_size = float(self.lay.get("fontSize", 14))
        self._setup_styles()
        self._setup_section()

    # ---------- setup ----------
    def _setup_styles(self):
        st = self.doc.styles["Normal"]
        st.font.name = self.base_font
        st.font.size = Pt(self.base_size)
        rpr = st.element.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            fonts.set(qn(a), self.base_font)
        rpr.append(_el("w:szCs", **{"w:val": int(self.base_size * 2)}))
        st.paragraph_format.line_spacing = float(self.lay.get("lineHeight", 1.5))
        st.paragraph_format.space_after = Pt(6)
        color = _hex(self.lay.get("headingColor", "#1e3a8a"))
        for lvl, size in zip(range(1, 7), (20, 17, 15, 14, 13, 12)):
            hs = self.doc.styles[f"Heading {lvl}"]
            hs.font.name = self.base_font
            hs.font.size = Pt(size)
            hs.font.bold = True
            if color:
                hs.font.color.rgb = color
            hr = hs.element.get_or_add_rPr()
            f = hr.find(qn("w:rFonts"))
            if f is None:
                f = _el("w:rFonts")
                hr.insert(0, f)
            for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
                f.set(qn(a), self.base_font)
            for a in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
                if f.get(qn(a)) is not None:
                    del f.attrib[qn(a)]
            hr.append(_el("w:szCs", **{"w:val": size * 2}))
            hr.append(_el("w:bCs"))

    def _setup_section(self):
        sec = self.doc.sections[0]
        w, h = page_dims_mm(self.lay)
        sec.orientation = WD_ORIENT.LANDSCAPE if self.lay.get("orientation") == "landscape" else WD_ORIENT.PORTRAIT
        sec.page_width, sec.page_height = Mm(w), Mm(h)
        m = self.lay["margins_mm"]
        sec.top_margin, sec.bottom_margin = Mm(m["top"]), Mm(m["bottom"])
        sec.left_margin, sec.right_margin = Mm(m["left"]), Mm(m["right"])
        sectPr = sec._sectPr
        if int(self.lay.get("columns", 1)) > 1:
            sectPr.append(_el("w:cols", **{"w:num": int(self.lay["columns"]), "w:space": 720}))
        if self.lay.get("pageBorder"):
            pb = _el("w:pgBorders", **{"w:offsetFrom": "page"})
            for side in ("top", "left", "bottom", "right"):
                pb.append(_el(f"w:{side}", **{"w:val": "single", "w:sz": 8, "w:space": 24, "w:color": "1E3A8A"}))
            sectPr.append(pb)
        if self.ctx.rtl:
            sectPr.append(_el("w:bidi"))
        has_cover = any(n.get("type") == "coverPage" for n in self.ctx.content.get("content", []))
        sec.different_first_page_header_footer = bool(self.lay.get("differentFirstPage") and has_cover)
        pn = self.lay["pageNumbers"]
        if int(pn.get("start", 1)) != 1:
            sectPr.append(_el("w:pgNumType", **{"w:start": int(pn["start"])}))
        for part, conf in (("header", self.lay["header"]), ("footer", self.lay["footer"])):
            hf = sec.header if part == "header" else sec.footer
            p = hf.paragraphs[0]
            _set_para_bidi(p, self.ctx.rtl)
            p.alignment = ALIGN.get(conf.get("align", "center"))
            if conf.get("text"):
                r = p.add_run(conf["text"].replace("{title}", self.ctx.title))
                _font_run(r, self.base_font, self.base_size - 3, self.ctx.rtl)
            if pn.get("enabled") and pn.get("position", "footer") == part:
                if conf.get("text"):
                    p = hf.add_paragraph()
                    _set_para_bidi(p, self.ctx.rtl)
                p.alignment = ALIGN.get(pn.get("align", "center"))
                fmt = {"roman": r"\* roman", "arabic-indic": r"\* ArabicAbjad"}.get(pn.get("format"), "")
                fmt = r"\* hindiNumbers" if pn.get("format") == "arabic-indic" else fmt
                _field(p, f"PAGE {fmt}".strip(), str(pn.get("start", 1)))

    # ---------- inline ----------
    def _inline(self, p, nodes, para_rtl: bool, base_marks=None):
        for n in nodes or []:
            t = n.get("type")
            if t == "text" and not _deleted(n):
                self._text_run(p, n.get("text", ""), (base_marks or []) + (n.get("marks") or []), para_rtl)
            elif t == "hardBreak":
                p.add_run().add_break()
            elif t == "citation":
                self._text_run(p, self.ctx.cite(n.get("attrs") or {}), [], para_rtl)
            elif t == "footnote":
                num = self.ctx.add_footnote((n.get("attrs") or {}).get("text", ""))
                r = self._text_run(p, str(num), [], para_rtl)
                r.font.superscript = True
            elif t == "inlineEquation":
                r = self._text_run(p, (n.get("attrs") or {}).get("latex", ""), [{"type": "italic"}], False)
                _font_run(r, "Cambria Math", None, False)

    def _text_run(self, p, text, marks, para_rtl):
        link = next((m for m in marks if m.get("type") == "link"), None)
        run_rtl = detect_direction(text) == "rtl" or (para_rtl and not detect_direction(text))
        if link:
            return self._hyperlink(p, text, (link.get("attrs") or {}).get("href", ""), run_rtl)
        r = p.add_run(text)
        family, size = None, None
        for m in marks:
            mt, a = m.get("type"), m.get("attrs") or {}
            if mt == "bold":
                r.bold = True
                r._r.get_or_add_rPr().append(_el("w:bCs"))
            elif mt == "italic":
                r.italic = True
                r._r.get_or_add_rPr().append(_el("w:iCs"))
            elif mt == "underline":
                r.underline = True
            elif mt == "strike":
                r.font.strike = True
            elif mt == "superscript":
                r.font.superscript = True
            elif mt == "subscript":
                r.font.subscript = True
            elif mt == "code":
                family = "Consolas"
            elif mt == "highlight":
                col = (a.get("color") or "#fde68a").lstrip("#")
                r._r.get_or_add_rPr().append(_el("w:shd", **{"w:val": "clear", "w:color": "auto", "w:fill": col.upper()}))
            elif mt == "textStyle":
                if _hex(a.get("color", "")):
                    r.font.color.rgb = _hex(a["color"])
                if a.get("fontFamily"):
                    family = a["fontFamily"].split(",")[0].strip("'\" ")
                if a.get("fontSize"):
                    try:
                        size = float(re.sub(r"[^0-9.]", "", str(a["fontSize"])))
                        if str(a["fontSize"]).endswith("px"):
                            size *= 0.75
                    except ValueError:
                        pass
        _font_run(r, family, size, run_rtl)
        return r

    def _hyperlink(self, p, text, href, rtl):
        if not re.match(r"^(https?://|mailto:|#)", href or ""):
            return p.add_run(text)
        rid = p.part.relate_to(href, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
                               is_external=True)
        h = _el("w:hyperlink", **{"r:id": rid})
        r = OxmlElement("w:r")
        rPr = OxmlElement("w:rPr")
        rPr.append(_el("w:color", **{"w:val": "2563EB"}))
        rPr.append(_el("w:u", **{"w:val": "single"}))
        if rtl:
            rPr.append(_el("w:rtl"))
        r.append(rPr)
        t = _el("w:t", **{"xml:space": "preserve"})
        t.text = text
        r.append(t)
        h.append(r)
        p._p.append(h)
        from docx.text.run import Run
        return Run(r, p)

    # ---------- blocks ----------
    def _para(self, container, n, style=None):
        attrs = n.get("attrs") or {}
        p = container.add_paragraph(style=style)
        txt = node_text(n)
        d = attrs.get("dir") or detect_direction(txt) or ("rtl" if self.ctx.rtl else "ltr")
        _set_para_bidi(p, d == "rtl")
        align = attrs.get("textAlign")
        if align in ALIGN:
            # In a bidi paragraph Word swaps left/right, so map logical alignment explicitly
            if d == "rtl" and align in ("left", "right"):
                align = {"left": "right", "right": "left"}[align]
            p.alignment = ALIGN[align]
        if attrs.get("lineHeight"):
            try:
                p.paragraph_format.line_spacing = float(attrs["lineHeight"])
            except ValueError:
                pass
        if attrs.get("spacingAfter") is not None:
            p.paragraph_format.space_after = Pt(float(attrs["spacingAfter"]))
        self._inline(p, n.get("content"), d == "rtl")
        return p

    def _caption(self, container, text, rtl):
        p = container.add_paragraph(style="Caption")
        _set_para_bidi(p, rtl)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text)
        _font_run(r, self.base_font, self.base_size - 2, rtl)

    def _list(self, container, n, level=0):
        ordered = n["type"] == "orderedList"
        base = "List Number" if ordered else "List Bullet"
        style = base if level == 0 else f"{base} {min(level + 1, 3)}"
        for item in n.get("content", []):
            for child in item.get("content", []):
                if child["type"] in ("bulletList", "orderedList"):
                    self._list(container, child, level + 1)
                elif child["type"] == "paragraph":
                    self._para(container, child, style=style)
                else:
                    self._block(container, child)

    def _table(self, container, n):
        rows = n.get("content", [])
        if not rows:
            return
        attrs = n.get("attrs") or {}
        # compute grid size accounting for colspan/rowspan
        ncols = max(sum(int((c.get("attrs") or {}).get("colspan", 1)) for c in r.get("content", [])) for r in rows)
        table = container.add_table(rows=len(rows), cols=ncols)
        borders = attrs.get("borders", "all")
        table.style = "Table Grid" if borders == "all" else None
        if borders == "outer":
            tb = _el("w:tblBorders")
            for side in ("top", "left", "bottom", "right"):
                tb.append(_el(f"w:{side}", **{"w:val": "single", "w:sz": 8, "w:space": 0, "w:color": "64748B"}))
            table._tbl.tblPr.append(tb)
        if self.ctx.rtl:
            table._tbl.tblPr.append(_el("w:bidiVisual"))
        occupied = set()
        for ri, row in enumerate(rows):
            ci = 0
            for cell in row.get("content", []):
                while (ri, ci) in occupied:
                    ci += 1
                if ci >= ncols:
                    break
                ca = cell.get("attrs") or {}
                cs, rs = int(ca.get("colspan", 1)), int(ca.get("rowspan", 1))
                target = table.cell(ri, ci)
                end = table.cell(min(ri + rs - 1, len(rows) - 1), min(ci + cs - 1, ncols - 1))
                if end is not target:
                    target = target.merge(end)
                for rr in range(ri, ri + rs):
                    for cc in range(ci, ci + cs):
                        occupied.add((rr, cc))
                target.paragraphs[0]._p.getparent().remove(target.paragraphs[0]._p)
                for child in cell.get("content", []) or [{"type": "paragraph"}]:
                    if child["type"] == "paragraph":
                        p = self._para(target, child)
                        if cell["type"] == "tableHeader":
                            for r in p.runs:
                                r.bold = True
                    else:
                        self._block(target, child)
                if not target.paragraphs:
                    target.add_paragraph()
                bg = ca.get("backgroundColor") or ("#DBEAFE" if cell["type"] == "tableHeader" else None)
                if bg and _hex(bg):
                    target._tc.get_or_add_tcPr().append(
                        _el("w:shd", **{"w:val": "clear", "w:color": "auto", "w:fill": bg.lstrip("#").upper()}))
                ci += cs
        if attrs.get("caption"):
            self._caption(container, self.ctx.next_table_label(attrs["caption"]), self.ctx.rtl)

    def _image(self, container, n):
        a = n.get("attrs") or {}
        data = decode_data_uri(a.get("src", "") or a.get("image", ""))
        if not data:
            return
        w, _ = page_dims_mm(self.lay)
        max_w = w - self.lay["margins_mm"]["left"] - self.lay["margins_mm"]["right"]
        width_mm = max_w
        if a.get("width"):
            try:
                v = str(a["width"])
                width_mm = max_w * float(v[:-1]) / 100 if v.endswith("%") else float(re.sub(r"[^0-9.]", "", v)) * 0.2646
            except ValueError:
                pass
        width_mm = min(width_mm, max_w)
        p = container.add_paragraph()
        p.alignment = ALIGN.get(a.get("align", "center"), WD_ALIGN_PARAGRAPH.CENTER)
        try:
            p.add_run().add_picture(io.BytesIO(data), width=Mm(width_mm))
        except Exception:
            p.add_run("[image could not be embedded]")
        if a.get("caption"):
            self._caption(container, self.ctx.next_figure_label(a["caption"]), self.ctx.rtl)

    def _simple(self, container, text, style=None, bold=False, align=None, size=None, rtl=None):
        rtl = self.ctx.rtl if rtl is None else rtl
        p = container.add_paragraph(style=style)
        _set_para_bidi(p, rtl)
        if align:
            p.alignment = ALIGN[align]
        for seg, it in split_italic_markers(text):
            r = p.add_run(seg)
            r.bold, r.italic = bold or None, it or None
            _font_run(r, None, size, rtl)
        return p

    def _cover(self, n):
        a = {**self.ctx.metadata, **(n.get("attrs") or {})}
        for key in ("university", "college", "department"):
            if a.get(key):
                self._simple(self.doc, a[key], bold=True, align="center", size=self.base_size + 2)
        for _ in range(4):
            self.doc.add_paragraph()
        p = self._simple(self.doc, a.get("title") or self.ctx.title, bold=True, align="center", size=26)
        if _hex(self.lay.get("headingColor")):
            for r in p.runs:
                r.font.color.rgb = _hex(self.lay["headingColor"])
        for _ in range(4):
            self.doc.add_paragraph()
        ar = self.ctx.language.startswith("ar")
        labels = {"author": "إعداد" if ar else "Prepared by", "stage": "المرحلة" if ar else "Stage",
                  "supervisor": "إشراف" if ar else "Supervisor", "date": "التاريخ" if ar else "Date"}
        for key, lab in labels.items():
            if a.get(key):
                self._simple(self.doc, f"{lab}: {a[key]}", align="center", size=self.base_size + 1)
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    def _toc(self):
        self._simple(self.doc, self.ctx.L["toc"], style="Heading 1", rtl=self.ctx.rtl)
        p = self.doc.add_paragraph()
        _set_para_bidi(p, self.ctx.rtl)
        # Real Word TOC field; cached entries shown until the user presses F9 / Word updates fields.
        r = p.add_run()._r
        r.append(_el("w:fldChar", **{"w:fldCharType": "begin", "w:dirty": "true"}))
        it = _el("w:instrText", **{"xml:space": "preserve"})
        it.text = ' TOC \\o "1-3" \\h \\z \\u '
        r.append(it)
        r.append(_el("w:fldChar", **{"w:fldCharType": "separate"}))
        for s in self.ctx.sections:
            q = self.doc.add_paragraph()
            _set_para_bidi(q, self.ctx.rtl)
            q.paragraph_format.left_indent = Mm(6 * (s["level"] - 1)) if not self.ctx.rtl else None
            q.paragraph_format.right_indent = Mm(6 * (s["level"] - 1)) if self.ctx.rtl else None
            q.add_run(s["heading"])
        end = self.doc.add_paragraph().add_run()._r
        end.append(_el("w:fldChar", **{"w:fldCharType": "end"}))
        settings = self.doc.settings.element
        settings.append(_el("w:updateFields", **{"w:val": "true"}))

    def _block(self, container, n):
        t = n.get("type")
        if t == "paragraph":
            self._para(container, n)
        elif t == "heading":
            lvl = max(1, min(6, int((n.get("attrs") or {}).get("level", 1))))
            self._para(container, n, style=f"Heading {lvl}")
        elif t in ("bulletList", "orderedList", "taskList"):
            self._list(container, {**n, "type": "bulletList" if t == "taskList" else t})
        elif t == "blockquote":
            for c in n.get("content", []):
                p = self._para(container, c, style="Quote") if c["type"] == "paragraph" else self._block(container, c)
        elif t == "codeBlock":
            p = container.add_paragraph()
            r = p.add_run(node_text(n))
            _font_run(r, "Consolas", self.base_size - 3, False)
        elif t == "horizontalRule":
            p = container.add_paragraph()
            pPr = p._p.get_or_add_pPr()
            bdr = _el("w:pBdr")
            bdr.append(_el("w:bottom", **{"w:val": "single", "w:sz": 6, "w:space": 1, "w:color": "94A3B8"}))
            pPr.append(bdr)
        elif t == "pageBreak":
            container.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
        elif t == "image":
            self._image(container, n)
        elif t == "chart":
            self._image(container, {"attrs": {**(n.get("attrs") or {}), "src": (n.get("attrs") or {}).get("image", "")}})
        elif t == "table":
            self._table(container, n)
        elif t == "equation":
            p = container.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run((n.get("attrs") or {}).get("latex", ""))
            r.italic = True
            _font_run(r, "Cambria Math", None, False)
        elif t == "coverPage":
            self._cover(n)
        elif t == "tableOfContents":
            self._toc()
        elif t in ("figureList", "tableList"):
            items = self.ctx.figures if t == "figureList" else self.ctx.tables
            self._simple(container, self.ctx.L["figures" if t == "figureList" else "tables"], style="Heading 1")
            lab = self.ctx.L["figure" if t == "figureList" else "table"]
            for i, c in enumerate(items, 1):
                self._simple(container, f"{lab} {i}: {c}")
        elif t == "bibliography":
            self._simple(container, self.ctx.L["references"], style="Heading 1")
            for ref in self.ctx.bibliography():
                p = self._simple(container, ref, rtl=detect_direction(ref) == "rtl")
                p.paragraph_format.first_line_indent = Mm(-10)
                p.paragraph_format.left_indent = Mm(10)
        elif t == "caption":
            self._caption(container, node_text(n), self.ctx.rtl)

    def render(self) -> bytes:
        self.doc.core_properties.title = self.ctx.title
        self.doc.core_properties.author = self.ctx.metadata.get("author", "")
        for n in self.ctx.content.get("content", []):
            self._block(self.doc, n)
        if self.ctx.footnotes:
            self._simple(self.doc, self.ctx.L["notes"], style="Heading 2")
            for i, f in enumerate(self.ctx.footnotes, 1):
                self._simple(self.doc, f"{i}. {f}", size=self.base_size - 2)
        buf = io.BytesIO()
        self.doc.save(buf)
        return buf.getvalue()


def export_docx(ctx: ExportContext) -> bytes:
    return DocxExporter(ctx).render()
