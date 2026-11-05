"""PDF rendering engine (ReportLab) with page layout: sizes, margins, header/footer, page numbers,
embedded TrueType fonts (Amiri covers Arabic + Latin), RTL/LTR/mixed text, tables, images, lists."""
import io
import re
from dataclasses import dataclass

from reportlab.lib.colors import HexColor, black
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, Image, PageBreak, PageTemplate, Spacer, Table,
                                TableStyle)

from ..config import get_settings
from ..documents.schema import is_deleted as _deleted, detect_direction, node_text, page_dims_mm
from .bidi import reorder_line, visual_word
from .context import ExportContext, decode_data_uri, split_italic_markers

_FONTS_READY = False


def register_fonts():
    global _FONTS_READY
    if _FONTS_READY:
        return
    d = get_settings().font_dir
    pdfmetrics.registerFont(TTFont("RSP", str(d / "Amiri-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("RSP-Bold", str(d / "Amiri-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("RSP-Italic", str(d / "Amiri-Italic.ttf")))
    pdfmetrics.registerFont(TTFont("RSP-BoldItalic", str(d / "Amiri-Bold.ttf")))
    from reportlab.lib.fonts import addMapping
    addMapping("RSP", 0, 0, "RSP"); addMapping("RSP", 1, 0, "RSP-Bold")
    addMapping("RSP", 0, 1, "RSP-Italic"); addMapping("RSP", 1, 1, "RSP-BoldItalic")
    _FONTS_READY = True


@dataclass
class Tok:
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    color: str | None = None
    highlight: str | None = None
    size: float | None = None
    sup: bool = False
    link: str | None = None

    @property
    def font(self):
        return "RSP" + ("-BoldItalic" if self.bold and self.italic else "-Bold" if self.bold else "-Italic" if self.italic else "")


def _color(c, default=None):
    if c and re.match(r"^#[0-9a-fA-F]{6}$", c):
        return HexColor(c)
    return default


class BidiParagraph(Flowable):
    def __init__(self, tokens: list[Tok], size: float, leading: float, rtl: bool, align: str = "start",
                 space_after: float = 4, indent: float = 0, color=None, bullet: str | None = None):
        super().__init__()
        self.tokens, self.size, self.leading, self.rtl = tokens, size, leading, rtl
        self.align, self.space_after, self.indent, self.color, self.bullet = align, space_after, indent, color, bullet
        self.lines = []

    def _w(self, t: Tok, rtl_run: bool) -> float:
        sz = (t.size or self.size) * (0.65 if t.sup else 1)
        return pdfmetrics.stringWidth(visual_word(t.text, rtl_run or self.rtl), t.font, sz)

    def wrap(self, availWidth, availHeight):
        width = availWidth - self.indent
        self.width = availWidth
        # split tokens into words + spaces in logical order
        pieces = []
        for t in self.tokens:
            for part in re.split(r"(\s+|\n)", t.text):
                if part:
                    pieces.append(Tok(**{**t.__dict__, "text": part}))
        self.lines, cur, cur_w = [], [], 0.0
        for p in pieces:
            if p.text == "\n":
                self.lines.append(cur); cur, cur_w = [], 0.0
                continue
            w = self._w(p, detect_direction(p.text) == "rtl")
            if p.text.isspace() and not cur:
                continue
            if cur_w + w > width and cur and not p.text.isspace():
                while cur and cur[-1].text.isspace():
                    cur.pop()
                self.lines.append(cur); cur, cur_w = [], 0.0
            cur.append(p); cur_w += w
        if cur:
            self.lines.append(cur)
        if not self.lines:
            self.lines = [[]]
        self.height = len(self.lines) * self.leading + self.space_after
        return availWidth, self.height

    def split(self, availWidth, availHeight):
        self.wrap(availWidth, availHeight)
        n = int((availHeight - self.space_after) // self.leading)
        if n <= 0 or n >= len(self.lines):
            return [] if n <= 0 else [self]
        a = BidiParagraph([], self.size, self.leading, self.rtl, self.align, 0, self.indent, self.color, self.bullet)
        b = BidiParagraph([], self.size, self.leading, self.rtl, self.align, self.space_after, self.indent, self.color)
        a.tokens = [t for line in self.lines[:n] for t in line + [Tok("\n")]][:-1]
        b.tokens = [t for line in self.lines[n:] for t in line + [Tok("\n")]][:-1]
        return [a, b]

    def draw(self):
        c = self.canv
        y = self.height - self.space_after - self.size
        avail = self.width - self.indent
        for li, line in enumerate(self.lines):
            visual = reorder_line(line, self.rtl)
            glyphs = [(t, visual_word(t.text, rtl)) for t, rtl in visual]
            sizes = [(t.size or self.size) * (0.65 if t.sup else 1) for t, _ in glyphs]
            widths = [pdfmetrics.stringWidth(g, t.font, s) for (t, g), s in zip(glyphs, sizes)]
            total = sum(widths)
            last = li == len(self.lines) - 1
            align = self.align
            if align == "start":
                align = "right" if self.rtl else "left"
            elif align == "end":
                align = "left" if self.rtl else "right"
            gap = 0.0
            if align == "justify" and not last:
                spaces = sum(1 for t, _ in glyphs if t.text.isspace())
                gap = (avail - total) / spaces if spaces else 0
                align = "right" if self.rtl else "left"
            x0 = {"left": 0.0, "right": avail - total, "center": (avail - total) / 2}.get(align, 0.0)
            x = x0 + (0 if self.rtl else self.indent)
            if self.bullet and li == 0:
                c.setFont("RSP", self.size)
                c.setFillColor(self.color or black)
                bx = self.width - self.indent + 4 if self.rtl else self.indent - 12
                c.drawString(bx, y, self.bullet)
            for (t, g), s, w in zip(glyphs, sizes, widths):
                yy = y + (s * 0.6 if t.sup else 0)
                if t.highlight:
                    c.setFillColor(_color(t.highlight, HexColor("#fde68a")))
                    c.rect(x, yy - s * 0.25, w + (gap if t.text.isspace() else 0), s * 1.15, stroke=0, fill=1)
                c.setFillColor(_color(t.color, self.color or black))
                c.setFont(t.font, s)
                if not t.text.isspace():
                    c.drawString(x, yy, g)
                if t.underline or t.link:
                    c.setStrokeColor(_color(t.color, self.color or black)); c.setLineWidth(0.5)
                    c.line(x, yy - 1.5, x + w, yy - 1.5)
                if t.strike:
                    c.setLineWidth(0.5); c.line(x, yy + s * 0.3, x + w, yy + s * 0.3)
                if t.link and re.match(r"^https?://", t.link):
                    c.linkURL(t.link, (x, yy - 2, x + w, yy + s), relative=1)
                x += w + (gap if t.text.isspace() else 0)
            y -= self.leading


class PdfExporter:
    def __init__(self, ctx: ExportContext):
        register_fonts()
        self.ctx, self.lay = ctx, ctx.layout
        self.size = float(self.lay.get("fontSize", 14)) * 0.85  # pt
        self.lh = float(self.lay.get("lineHeight", 1.5))
        self.heading_color = _color(self.lay.get("headingColor"), HexColor("#1e3a8a"))
        w, h = page_dims_mm(self.lay)
        self.page_w, self.page_h = w * mm, h * mm
        m = self.lay["margins_mm"]
        self.margins = {k: float(v) * mm for k, v in m.items()}
        self.frame_w = self.page_w - self.margins["left"] - self.margins["right"]
        self.has_cover = any(n.get("type") == "coverPage" for n in ctx.content.get("content", []))

    # ---------- inline -> tokens ----------
    def tokens(self, nodes, marks_extra=None) -> list[Tok]:
        out = []
        for n in nodes or []:
            t = n.get("type")
            if t == "text" and not _deleted(n):
                tok = Tok(n.get("text", ""))
                for m in (n.get("marks") or []) + (marks_extra or []):
                    mt, a = m.get("type"), m.get("attrs") or {}
                    if mt == "bold": tok.bold = True
                    elif mt == "italic": tok.italic = True
                    elif mt == "underline": tok.underline = True
                    elif mt == "strike": tok.strike = True
                    elif mt in ("superscript", "subscript"): tok.sup = True
                    elif mt == "highlight": tok.highlight = a.get("color") or "#fde68a"
                    elif mt == "link": tok.link, tok.color = a.get("href"), "#2563eb"
                    elif mt == "textStyle":
                        tok.color = a.get("color") or tok.color
                        if a.get("fontSize"):
                            try:
                                v = float(re.sub(r"[^0-9.]", "", str(a["fontSize"])))
                                tok.size = v * 0.75 if str(a["fontSize"]).endswith("px") else v
                            except ValueError:
                                pass
                out.append(tok)
            elif t == "hardBreak":
                out.append(Tok("\n"))
            elif t == "citation":
                out.append(Tok(self.ctx.cite(n.get("attrs") or {})))
            elif t == "footnote":
                out.append(Tok(str(self.ctx.add_footnote((n.get("attrs") or {}).get("text", ""))), sup=True))
            elif t == "inlineEquation":
                out.append(Tok((n.get("attrs") or {}).get("latex", ""), italic=True))
        return out

    def para(self, n, size=None, bold=False, color=None, align=None, space_after=None, indent=0, bullet=None):
        attrs = n.get("attrs") or {}
        txt = node_text(n)
        rtl = (attrs.get("dir") or detect_direction(txt) or ("rtl" if self.ctx.rtl else "ltr")) == "rtl"
        toks = self.tokens(n.get("content"), [{"type": "bold"}] if bold else None)
        a = align or attrs.get("textAlign") or "start"
        if a in ("left", "right") and rtl == (a == "right"):
            a = "start"
        s = size or self.size
        lh = float(attrs.get("lineHeight") or self.lh)
        return BidiParagraph(toks, s, s * lh, rtl, a, self.size * 0.5 if space_after is None else space_after,
                             indent, color, bullet)

    def text_para(self, text, **kw):
        content = [{"type": "text", "text": seg, "marks": [{"type": "italic"}] if it else []}
                   for seg, it in split_italic_markers(text)]
        return self.para({"type": "paragraph", "content": content}, **kw)

    # ---------- blocks ----------
    def block(self, n, story, level=0):
        t = n.get("type")
        if t == "paragraph":
            story.append(self.para(n))
        elif t == "heading":
            lvl = max(1, min(6, int((n.get("attrs") or {}).get("level", 1))))
            size = {1: 20, 2: 17, 3: 15, 4: 14, 5: 13, 6: 12}[lvl] * 0.9
            story.append(Spacer(1, size * 0.4))
            story.append(self.para(n, size=size, bold=True, color=self.heading_color, space_after=size * 0.35))
        elif t in ("bulletList", "orderedList", "taskList"):
            for i, item in enumerate(n.get("content", []), int((n.get("attrs") or {}).get("start", 1))):
                bullet = f"{i}." if t == "orderedList" else "•"
                first = True
                for child in item.get("content", []):
                    if child["type"] == "paragraph":
                        story.append(self.para(child, indent=18 * (level + 1), bullet=bullet if first else None))
                        first = False
                    elif child["type"] in ("bulletList", "orderedList"):
                        self.block(child, story, level + 1)
                    else:
                        self.block(child, story, level + 1)
        elif t == "blockquote":
            for c in n.get("content", []):
                if c["type"] == "paragraph":
                    story.append(self.para(c, indent=20, color=HexColor("#475569")))
        elif t == "codeBlock":
            story.append(self.text_para(node_text(n), size=self.size * 0.85, align="left"))
        elif t == "horizontalRule":
            story.append(Table([[""]], colWidths=[self.frame_w], style=[("LINEBELOW", (0, 0), (-1, -1), 0.5, HexColor("#94a3b8"))]))
        elif t == "pageBreak":
            story.append(PageBreak())
        elif t in ("image", "chart"):
            a = n.get("attrs") or {}
            data = decode_data_uri(a.get("src") or a.get("image") or "")
            if data:
                try:
                    ir = ImageReader(io.BytesIO(data))
                    iw, ih = ir.getSize()
                    w = self.frame_w
                    v = str(a.get("width") or "")
                    if v.endswith("%"):
                        w = self.frame_w * float(v[:-1]) / 100
                    elif v:
                        w = float(re.sub(r"[^0-9.]", "", v) or 0) * 0.75 or self.frame_w
                    w = min(w, self.frame_w)
                    h = w * ih / iw
                    max_h = self.page_h - self.margins["top"] - self.margins["bottom"] - 40
                    if h > max_h:
                        w, h = w * max_h / h, max_h
                    img = Image(io.BytesIO(data), width=w, height=h)
                    img.hAlign = {"left": "LEFT", "right": "RIGHT"}.get(a.get("align"), "CENTER")
                    story.append(img)
                except Exception:
                    story.append(self.text_para("[image could not be rendered]"))
            if a.get("caption"):
                story.append(self.text_para(self.ctx.next_figure_label(a["caption"]), size=self.size * 0.85, align="center"))
        elif t == "table":
            self.table(n, story)
        elif t == "equation":
            story.append(self.text_para((n.get("attrs") or {}).get("latex", ""), align="center"))
        elif t == "coverPage":
            self.cover(n, story)
        elif t == "tableOfContents":
            story.append(self.text_para(self.ctx.L["toc"], size=19, bold=True, color=self.heading_color))
            for s in self.ctx.sections:
                entry = self.text_para(s["heading"], indent=14 * (s["level"] - 1))
                entry.rtl = self.ctx.rtl
                story.append(entry)
        elif t in ("figureList", "tableList"):
            items = self.ctx.figures if t == "figureList" else self.ctx.tables
            lab = self.ctx.L["figure" if t == "figureList" else "table"]
            story.append(self.text_para(self.ctx.L["figures" if t == "figureList" else "tables"], size=19, bold=True,
                                        color=self.heading_color))
            for i, c in enumerate(items, 1):
                story.append(self.text_para(f"{lab} {i}: {c}"))
        elif t == "bibliography":
            story.append(self.text_para(self.ctx.L["references"], size=19, bold=True, color=self.heading_color))
            for ref in self.ctx.bibliography():
                p = self.text_para(ref)
                p.rtl = detect_direction(ref) == "rtl"
                story.append(p)
        elif t == "caption":
            story.append(self.text_para(node_text(n), size=self.size * 0.85, align="center"))

    def table(self, n, story):
        rows = n.get("content", [])
        if not rows:
            return
        ncols = max(sum(int((c.get("attrs") or {}).get("colspan", 1)) for c in r.get("content", [])) for r in rows)
        grid = [["" for _ in range(ncols)] for _ in rows]
        borders = (n.get("attrs") or {}).get("borders", "all")
        styles = [("VALIGN", (0, 0), (-1, -1), "TOP")]
        if borders == "all":
            styles.append(("GRID", (0, 0), (-1, -1), 0.5, HexColor("#64748b")))
        elif borders == "outer":
            styles.append(("BOX", (0, 0), (-1, -1), 0.8, HexColor("#64748b")))
        occupied = set()
        colw = self.frame_w / ncols
        for ri, row in enumerate(rows):
            ci = 0
            for cell in row.get("content", []):
                while (ri, ci) in occupied:
                    ci += 1
                if ci >= ncols:
                    break
                a = cell.get("attrs") or {}
                cs, rs = int(a.get("colspan", 1)), int(a.get("rowspan", 1))
                vc = ncols - ci - cs if self.ctx.rtl else ci  # RTL tables: first column on the right
                flows = []
                for child in cell.get("content", []):
                    if child["type"] == "paragraph":
                        flows.append(self.para(child, bold=cell["type"] == "tableHeader", space_after=1))
                grid[ri][vc] = flows or ""
                if cs > 1 or rs > 1:
                    styles.append(("SPAN", (vc, ri), (vc + cs - 1, ri + rs - 1)))
                bg = a.get("backgroundColor") or ("#dbeafe" if cell["type"] == "tableHeader" else None)
                if _color(bg):
                    styles.append(("BACKGROUND", (vc, ri), (vc + cs - 1, ri + rs - 1), _color(bg)))
                for rr in range(ri, ri + rs):
                    for cc in range(ci, ci + cs):
                        occupied.add((rr, cc))
                ci += cs
        tbl = Table(grid, colWidths=[colw] * ncols, style=TableStyle(styles), repeatRows=1 if rows and
                    any(c["type"] == "tableHeader" for c in rows[0].get("content", [])) else 0)
        story.append(tbl)
        cap = (n.get("attrs") or {}).get("caption")
        if cap:
            story.append(self.text_para(self.ctx.next_table_label(cap), size=self.size * 0.85, align="center"))
        story.append(Spacer(1, 6))

    def cover(self, n, story):
        a = {**self.ctx.metadata, **(n.get("attrs") or {})}
        for key in ("university", "college", "department"):
            if a.get(key):
                story.append(self.text_para(a[key], size=self.size + 3, bold=True, align="center"))
        story.append(Spacer(1, 70 * mm * self.page_h / (297 * mm) * 0.6))
        story.append(self.text_para(a.get("title") or self.ctx.title, size=24, bold=True, align="center",
                                    color=self.heading_color))
        story.append(Spacer(1, 50 * mm * 0.6))
        ar = self.ctx.language.startswith("ar")
        labels = {"author": "إعداد" if ar else "Prepared by", "stage": "المرحلة" if ar else "Stage",
                  "supervisor": "إشراف" if ar else "Supervisor", "date": "التاريخ" if ar else "Date"}
        for key, lab in labels.items():
            if a.get(key):
                story.append(self.text_para(f"{lab}: {a[key]}", align="center", size=self.size + 1))
        story.append(PageBreak())

    # ---------- page furniture ----------
    def _draw_hf(self, canv, doc):
        page = canv.getPageNumber()
        if page == 1 and self.has_cover and self.lay.get("differentFirstPage"):
            return
        pn = self.lay["pageNumbers"]
        canv.saveState()
        size = self.size * 0.8
        for part in ("header", "footer"):
            conf = self.lay[part]
            y = self.page_h - self.margins["top"] / 2 if part == "header" else self.margins["bottom"] / 2
            lines = []
            if conf.get("text"):
                lines.append((conf["text"].replace("{title}", self.ctx.title), conf.get("align", "center")))
            if pn.get("enabled") and pn.get("position", "footer") == part:
                num = page - 1 + int(pn.get("start", 1)) - (1 if self.has_cover and self.lay.get("differentFirstPage") else 0)
                s = str(num)
                if pn.get("format") == "arabic-indic":
                    s = s.translate(str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩"))
                elif pn.get("format") == "roman":
                    s = _roman(num)
                lines.append((s, pn.get("align", "center")))
            for i, (text, align) in enumerate(lines):
                p = self.text_para(text, size=size, align=align, space_after=0)
                p.wrap(self.frame_w, 100)
                p.drawOn(canv, self.margins["left"], y - i * size * 1.3 - size * 0.3)
        if self.lay.get("pageBorder"):
            canv.setStrokeColor(self.heading_color); canv.setLineWidth(1)
            canv.rect(10 * mm, 10 * mm, self.page_w - 20 * mm, self.page_h - 20 * mm)
        canv.restoreState()

    def render(self) -> bytes:
        buf = io.BytesIO()
        doc = BaseDocTemplate(buf, pagesize=(self.page_w, self.page_h), title=self.ctx.title,
                              author=self.ctx.metadata.get("author", ""), leftMargin=self.margins["left"],
                              rightMargin=self.margins["right"], topMargin=self.margins["top"],
                              bottomMargin=self.margins["bottom"])
        cols = max(1, int(self.lay.get("columns", 1)))
        gap = 6 * mm
        fw = (self.frame_w - gap * (cols - 1)) / cols
        frames = []
        for i in range(cols):
            idx = cols - 1 - i if self.ctx.rtl else i  # RTL columns flow right-to-left
            frames.append(Frame(self.margins["left"] + idx * (fw + gap), self.margins["bottom"], fw,
                                self.page_h - self.margins["top"] - self.margins["bottom"], id=f"c{i}",
                                leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0))
        if cols > 1:
            self.frame_w = fw
        doc.addPageTemplates([PageTemplate(id="main", frames=frames, onPage=self._draw_hf)])
        story = []
        blocks = self.ctx.content.get("content", [])
        for i, n in enumerate(blocks):
            nxt = blocks[i + 1]["type"] if i + 1 < len(blocks) else None
            # an empty placeholder paragraph before a page break / end must not create a blank page
            if n.get("type") == "paragraph" and not node_text(n).strip() and nxt in (None, "pageBreak"):
                continue
            self.block(n, story)
        if self.ctx.footnotes:
            story.append(Spacer(1, 10))
            story.append(self.text_para(self.ctx.L["notes"], size=15, bold=True, color=self.heading_color))
            for i, f in enumerate(self.ctx.footnotes, 1):
                story.append(self.text_para(f"{i}. {f}", size=self.size * 0.85))
        if not story:
            story.append(Spacer(1, 1))
        doc.build(story)
        return buf.getvalue()


def _roman(n: int) -> str:
    vals = [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
            (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s; n -= v
    return out


def export_pdf(ctx: ExportContext) -> bytes:
    return PdfExporter(ctx).render()
