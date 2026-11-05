"""ODT (OpenDocument Text) export engine: page layout, RTL, styles, lists, tables, images, real footnotes."""
import io
import zipfile
from xml.sax.saxutils import escape as esc

from ..documents.schema import detect_direction, is_deleted, node_text, page_dims_mm
from .context import ExportContext, decode_data_uri, split_italic_markers

NS = ('xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
      'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
      'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"')
ALIGN = {"left": "left", "right": "right", "center": "center", "justify": "justify"}


class OdtExporter:
    def __init__(self, ctx: ExportContext):
        self.ctx, self.lay = ctx, ctx.layout
        self.images: list[tuple[str, bytes, str]] = []
        self.auto: dict[str, str] = {}  # automatic style xml by name

    def _pstyle(self, rtl: bool, align: str | None, parent="Standard") -> str:
        key = f"P_{parent}_{int(rtl)}_{align or 'x'}"
        if key not in self.auto:
            al = f' fo:text-align="{ALIGN[align]}"' if align in ALIGN else ""
            self.auto[key] = (f'<style:style style:name="{key}" style:family="paragraph" style:parent-style-name="{parent}">'
                              f'<style:paragraph-properties style:writing-mode="{"rl-tb" if rtl else "lr-tb"}"{al}/></style:style>')
        return key

    def _tstyle(self, marks) -> str | None:
        props = []
        for m in marks:
            t, a = m.get("type"), m.get("attrs") or {}
            if t == "bold": props.append('fo:font-weight="bold" style:font-weight-complex="bold"')
            elif t == "italic": props.append('fo:font-style="italic" style:font-style-complex="italic"')
            elif t == "underline": props.append('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"')
            elif t == "strike": props.append('style:text-line-through-style="solid"')
            elif t == "superscript": props.append('style:text-position="super 58%"')
            elif t == "subscript": props.append('style:text-position="sub 58%"')
            elif t == "highlight": props.append(f'fo:background-color="{esc(a.get("color") or "#fde68a")}"')
            elif t == "textStyle":
                if a.get("color"): props.append(f'fo:color="{esc(a["color"])}"')
                if a.get("fontSize"): props.append(f'fo:font-size="{esc(str(a["fontSize"]))}" style:font-size-complex="{esc(str(a["fontSize"]))}"')
        if not props:
            return None
        key = "T" + str(abs(hash(" ".join(sorted(props)))) % 10**8)
        self.auto.setdefault(key, f'<style:style style:name="{key}" style:family="text"><style:text-properties {" ".join(props)}/></style:style>')
        return key

    def inline(self, nodes) -> str:
        out = []
        for n in nodes or []:
            t = n.get("type")
            if t == "text" and not is_deleted(n):
                txt = esc(n.get("text", ""))
                link = next((m for m in n.get("marks") or [] if m.get("type") == "link"), None)
                st = self._tstyle(n.get("marks") or [])
                span = f'<text:span text:style-name="{st}">{txt}</text:span>' if st else txt
                if link and str((link.get("attrs") or {}).get("href", "")).startswith(("http://", "https://", "mailto:")):
                    span = f'<text:a xlink:type="simple" xlink:href="{esc(link["attrs"]["href"])}">{span}</text:a>'
                out.append(span)
            elif t == "hardBreak":
                out.append("<text:line-break/>")
            elif t == "citation":
                out.append(esc(self.ctx.cite(n.get("attrs") or {})))
            elif t == "footnote":
                i = self.ctx.add_footnote((n.get("attrs") or {}).get("text", ""))
                out.append(f'<text:note text:id="ftn{i}" text:note-class="footnote"><text:note-citation>{i}</text:note-citation>'
                           f'<text:note-body><text:p text:style-name="Footnote">{esc(self.ctx.footnotes[-1])}</text:p></text:note-body></text:note>')
            elif t == "inlineEquation":
                out.append(esc((n.get("attrs") or {}).get("latex", "")))
        return "".join(out)

    def para(self, n, parent="Standard") -> str:
        a = n.get("attrs") or {}
        d = a.get("dir") or detect_direction(node_text(n)) or ("rtl" if self.ctx.rtl else "ltr")
        st = self._pstyle(d == "rtl", a.get("textAlign"), parent)
        return f'<text:p text:style-name="{st}">{self.inline(n.get("content"))}</text:p>'

    def simple(self, text, parent="Standard") -> str:
        st = self._pstyle(detect_direction(text) == "rtl" if detect_direction(text) else self.ctx.rtl, None, parent)
        body = "".join(f'<text:span text:style-name="{self._tstyle([{"type": "italic"}])}">{esc(s)}</text:span>' if it else esc(s)
                       for s, it in split_italic_markers(text))
        return f'<text:p text:style-name="{st}">{body}</text:p>'

    def image(self, a) -> str:
        data = decode_data_uri(a.get("src") or a.get("image") or "")
        if not data:
            return ""
        from PIL import Image
        im = Image.open(io.BytesIO(data))
        w_mm, _ = page_dims_mm(self.lay)
        avail = w_mm - self.lay["margins_mm"]["left"] - self.lay["margins_mm"]["right"]
        v = str(a.get("width") or "60%")
        width = avail * float(v[:-1]) / 100 if v.endswith("%") else min(avail, float("".join(c for c in v if c.isdigit() or c == ".") or 100) * 0.2646)
        height = width * im.height / im.width
        name = f"Pictures/img{len(self.images) + 1}.{(im.format or 'png').lower()}"
        self.images.append((name, data, Image.MIME.get(im.format, "image/png")))
        out = (f'<text:p text:style-name="{self._pstyle(False, "center")}"><draw:frame draw:name="img{len(self.images)}" text:anchor-type="as-char" '
               f'svg:width="{width:.1f}mm" svg:height="{height:.1f}mm"><draw:image xlink:href="{name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>')
        if a.get("caption"):
            out += f'<text:p text:style-name="{self._pstyle(self.ctx.rtl, "center", "Caption")}">{esc(self.ctx.next_figure_label(a["caption"]))}</text:p>'
        return out

    def table(self, n) -> str:
        rows = n.get("content", [])
        if not rows:
            return ""
        ncols = max(sum(int((c.get("attrs") or {}).get("colspan", 1)) for c in r.get("content", [])) for r in rows)
        border = "0.5pt solid #64748b" if (n.get("attrs") or {}).get("borders", "all") != "none" else "none"
        tname = f"Tbl{len(self.auto)}"
        self.auto[tname] = (f'<style:style style:name="{tname}" style:family="table"><style:table-properties table:align="margins" '
                            f'style:writing-mode="{"rl-tb" if self.ctx.rtl else "lr-tb"}"/></style:style>')
        out = [f'<table:table table:name="{tname}" table:style-name="{tname}"><table:table-column table:number-columns-repeated="{ncols}"/>']
        for r in rows:
            out.append("<table:table-row>")
            for c in r.get("content", []):
                a = c.get("attrs") or {}
                bg = a.get("backgroundColor") or ("#dbeafe" if c["type"] == "tableHeader" else None)
                cs = f"Cell{len(self.auto)}"
                self.auto[cs] = (f'<style:style style:name="{cs}" style:family="table-cell"><style:table-cell-properties fo:border="{border}" '
                                 f'fo:padding="0.1cm"{f" fo:background-color=\"{esc(bg)}\"" if bg else ""}/></style:style>')
                span = "".join(f' table:number-{k}-spanned="{int(a[v])}"' for k, v in (("columns", "colspan"), ("rows", "rowspan")) if int(a.get(v, 1)) > 1)
                body = "".join(self.block(x) for x in c.get("content", [])) or "<text:p/>"
                if c["type"] == "tableHeader":
                    body = body.replace("<text:p ", "<text:p ", 1)
                out.append(f'<table:table-cell table:style-name="{cs}" office:value-type="string"{span}>{body}</table:table-cell>')
                for _ in range(int(a.get("colspan", 1)) - 1):
                    out.append("<table:covered-table-cell/>")
            out.append("</table:table-row>")
        out.append("</table:table>")
        cap = (n.get("attrs") or {}).get("caption")
        if cap:
            out.append(f'<text:p text:style-name="{self._pstyle(self.ctx.rtl, "center", "Caption")}">{esc(self.ctx.next_table_label(cap))}</text:p>')
        return "".join(out)

    def lst(self, n) -> str:
        style = "LNum" if n["type"] == "orderedList" else "LBul"
        items = []
        for it in n.get("content", []):
            items.append("<text:list-item>" + "".join(self.block(c) for c in it.get("content", [])) + "</text:list-item>")
        return f'<text:list text:style-name="{style}">{"".join(items)}</text:list>'

    def block(self, n) -> str:
        t, a = n.get("type"), n.get("attrs") or {}
        if t == "paragraph": return self.para(n)
        if t == "heading":
            lvl = max(1, min(6, int(a.get("level", 1))))
            d = a.get("dir") or detect_direction(node_text(n)) or ("rtl" if self.ctx.rtl else "ltr")
            return f'<text:h text:style-name="{self._pstyle(d == "rtl", a.get("textAlign"), f"Heading_20_{lvl}")}" text:outline-level="{lvl}">{self.inline(n.get("content"))}</text:h>'
        if t in ("bulletList", "orderedList", "taskList"): return self.lst({**n, "type": "bulletList" if t == "taskList" else t})
        if t == "blockquote": return "".join(self.para(c, "Quotations") if c["type"] == "paragraph" else self.block(c) for c in n.get("content", []))
        if t == "codeBlock": return f'<text:p text:style-name="Preformatted_20_Text">{esc(node_text(n))}</text:p>'
        if t == "pageBreak": return '<text:p text:style-name="PageBreak"/>'
        if t in ("image", "chart"): return self.image(a)
        if t == "table": return self.table(n)
        if t == "equation": return f'<text:p text:style-name="{self._pstyle(False, "center")}">{esc(a.get("latex", ""))}</text:p>'
        if t == "horizontalRule": return '<text:p text:style-name="HR"/>'
        if t == "coverPage":
            m = {**self.ctx.metadata, **a}
            parts = [self.simple(m[k], "CoverOrg") for k in ("university", "college", "department") if m.get(k)]
            parts.append(self.simple(m.get("title") or self.ctx.title, "CoverTitle"))
            ar = self.ctx.language.startswith("ar")
            labels = {"author": "إعداد" if ar else "Prepared by", "stage": "المرحلة" if ar else "Stage",
                      "supervisor": "إشراف" if ar else "Supervisor", "date": "التاريخ" if ar else "Date"}
            parts += [self.simple(f"{lab}: {m[k]}", "CoverMeta") for k, lab in labels.items() if m.get(k)]
            return "".join(parts) + '<text:p text:style-name="PageBreak"/>'
        if t == "tableOfContents":
            return (f'<text:h text:style-name="Heading_20_1" text:outline-level="1">{esc(self.ctx.L["toc"])}</text:h>' +
                    "".join(self.simple(("    " * (s["level"] - 1)) + s["heading"]) for s in self.ctx.sections))
        if t in ("figureList", "tableList"):
            items = self.ctx.figures if t == "figureList" else self.ctx.tables
            lab = self.ctx.L["figure" if t == "figureList" else "table"]
            return (f'<text:h text:style-name="Heading_20_1" text:outline-level="1">{esc(self.ctx.L["figures" if t == "figureList" else "tables"])}</text:h>' +
                    "".join(self.simple(f"{lab} {i}: {c}") for i, c in enumerate(items, 1)))
        if t == "bibliography":
            return (f'<text:h text:style-name="Heading_20_1" text:outline-level="1">{esc(self.ctx.L["references"])}</text:h>' +
                    "".join(self.simple(r, "Bibliography") for r in self.ctx.bibliography()))
        if t == "caption": return self.para(n, "Caption")
        return "".join(self.block(c) for c in n.get("content", []) or [])

    def styles_xml(self) -> str:
        w, h = page_dims_mm(self.lay)
        m = self.lay["margins_mm"]
        font = esc(self.lay.get("fontFamily", "Amiri"))
        size = self.lay.get("fontSize", 14)
        color = esc(self.lay.get("headingColor", "#1e3a8a"))
        rtl = "rl-tb" if self.ctx.rtl else "lr-tb"
        heads = "".join(
            f'<style:style style:name="Heading_20_{l}" style:display-name="Heading {l}" style:family="paragraph" style:parent-style-name="Standard" '
            f'style:default-outline-level="{l}"><style:paragraph-properties fo:margin-top="0.35cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/>'
            f'<style:text-properties fo:font-size="{s}pt" style:font-size-complex="{s}pt" fo:font-weight="bold" style:font-weight-complex="bold" fo:color="{color}"/></style:style>'
            for l, s in zip(range(1, 7), (20, 17, 15, 14, 13, 12)))
        pn = self.lay["pageNumbers"]
        num = '<text:page-number text:select-page="current">1</text:page-number>'

        def band(conf, part):
            text = esc(conf.get("text", "").replace("{title}", self.ctx.title))
            n = num if pn.get("enabled") and pn.get("position", "footer") == part else ""
            if not text and not n:
                return ""
            return f'<style:{part}><text:p text:style-name="HF">{text}{" " if text and n else ""}{n}</text:p></style:{part}>'
        fmt = {"roman": "i", "arabic-indic": "١"}.get(pn.get("format"), "1")
        return f'''<?xml version="1.0" encoding="UTF-8"?><office:document-styles {NS}>
<office:font-face-decls><style:font-face style:name="{font}" svg:font-family="'{font}'"/></office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties style:writing-mode="{rtl}"/>
<style:text-properties style:font-name="{font}" style:font-name-complex="{font}" fo:font-size="{size}pt" style:font-size-complex="{size}pt" fo:language="{"ar" if self.ctx.rtl else "en"}" style:language-complex="ar"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:line-height="{int(float(self.lay.get("lineHeight", 1.5)) * 100)}%" fo:margin-bottom="0.15cm"/></style:style>
{heads}
<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="{size - 2}pt" style:font-size-complex="{size - 2}pt" fo:font-style="italic"/></style:style>
<style:style style:name="Footnote" style:family="paragraph"><style:text-properties fo:font-size="10pt" style:font-size-complex="10pt"/></style:style>
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm"/></style:style>
<style:style style:name="Preformatted_20_Text" style:family="paragraph"><style:paragraph-properties style:writing-mode="lr-tb"/><style:text-properties style:font-name="Courier New" fo:font-size="10pt"/></style:style>
<style:style style:name="Bibliography" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="1cm" fo:text-indent="-1cm"/></style:style>
<style:style style:name="CoverOrg" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-weight="bold" style:font-weight-complex="bold" fo:font-size="{size + 2}pt" style:font-size-complex="{size + 2}pt"/></style:style>
<style:style style:name="CoverTitle" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-top="5cm" fo:margin-bottom="4cm"/><style:text-properties fo:font-size="26pt" style:font-size-complex="26pt" fo:font-weight="bold" style:font-weight-complex="bold" fo:color="{color}"/></style:style>
<style:style style:name="CoverMeta" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="HF" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" style:font-size-complex="9pt" fo:color="#64748b"/></style:style>
<style:style style:name="PageBreak" style:family="paragraph"><style:paragraph-properties fo:break-after="page"/></style:style>
<style:style style:name="HR" style:family="paragraph"><style:paragraph-properties fo:border-bottom="0.5pt solid #94a3b8"/></style:style>
<text:list-style style:name="LBul"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="1.2cm"/></style:list-level-properties></text:list-level-style-bullet></text:list-style>
<text:list-style style:name="LNum"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="1.2cm"/></style:list-level-properties></text:list-level-style-number></text:list-style>
</office:styles>
<office:automatic-styles><style:page-layout style:name="PL"><style:page-layout-properties fo:page-width="{w}mm" fo:page-height="{h}mm" style:print-orientation="{self.lay.get("orientation", "portrait")}"
 fo:margin-top="{m["top"] / 2}mm" fo:margin-bottom="{m["bottom"] / 2}mm" fo:margin-left="{m["left"]}mm" fo:margin-right="{m["right"]}mm" style:writing-mode="{rtl}" style:num-format="{fmt}"
 {'fo:border="0.06pt solid #1e3a8a" fo:padding="0.3cm"' if self.lay.get("pageBorder") else ""}>
<style:columns fo:column-count="{int(self.lay.get("columns", 1))}" fo:column-gap="0.6cm"/></style:page-layout-properties>
<style:header-style><style:header-footer-properties fo:min-height="{m["top"] / 2}mm"/></style:header-style>
<style:footer-style><style:header-footer-properties fo:min-height="{m["bottom"] / 2}mm"/></style:footer-style></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PL">{band(self.lay["header"], "header")}{band(self.lay["footer"], "footer")}</style:master-page></office:master-styles>
</office:document-styles>'''

    def render(self) -> bytes:
        body = "".join(self.block(n) for n in self.ctx.content.get("content", []))
        content = (f'<?xml version="1.0" encoding="UTF-8"?><office:document-content {NS}><office:automatic-styles>{"".join(self.auto.values())}'
                   f'</office:automatic-styles><office:body><office:text>{body}</office:text></office:body></office:document-content>')
        meta = (f'<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
                f'xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>{esc(self.ctx.title)}</dc:title>'
                f'<dc:creator>{esc(self.ctx.metadata.get("author", ""))}</dc:creator></office:meta></office:document-meta>')
        files = "".join(f'<manifest:file-entry manifest:full-path="{n}" manifest:media-type="{mt}"/>' for n, _, mt in self.images)
        manifest = ('<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">'
                    '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>'
                    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
                    '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>'
                    f'<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>{files}</manifest:manifest>')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr(zipfile.ZipInfo("mimetype"), "application/vnd.oasis.opendocument.text")  # stored, first
            z.writestr("content.xml", content, zipfile.ZIP_DEFLATED)
            z.writestr("styles.xml", self.styles_xml(), zipfile.ZIP_DEFLATED)
            z.writestr("meta.xml", meta, zipfile.ZIP_DEFLATED)
            z.writestr("META-INF/manifest.xml", manifest, zipfile.ZIP_DEFLATED)
            for n, data, _ in self.images:
                z.writestr(n, data)
        return buf.getvalue()


def export_odt(ctx: ExportContext) -> bytes:
    return OdtExporter(ctx).render()
