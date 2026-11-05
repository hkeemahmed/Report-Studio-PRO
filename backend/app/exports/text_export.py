"""HTML (print-ready, with @page CSS), Markdown and plain-text exporters."""
import html as h

from ..documents.schema import is_deleted as _deleted, node_text, page_dims_mm, plain_text
from .context import ExportContext, split_italic_markers


def _ital(text: str) -> str:
    return "".join(f"<em>{h.escape(s)}</em>" if it else h.escape(s) for s, it in split_italic_markers(text))


class HtmlExporter:
    def __init__(self, ctx: ExportContext):
        self.ctx = ctx

    def inline(self, nodes) -> str:
        out = []
        for n in nodes or []:
            t = n.get("type")
            if t == "text" and not _deleted(n):
                s = h.escape(n.get("text", ""))
                for m in n.get("marks") or []:
                    mt, a = m.get("type"), m.get("attrs") or {}
                    if mt == "bold": s = f"<strong>{s}</strong>"
                    elif mt == "italic": s = f"<em>{s}</em>"
                    elif mt == "underline": s = f"<u>{s}</u>"
                    elif mt == "strike": s = f"<s>{s}</s>"
                    elif mt == "superscript": s = f"<sup>{s}</sup>"
                    elif mt == "subscript": s = f"<sub>{s}</sub>"
                    elif mt == "code": s = f"<code>{s}</code>"
                    elif mt == "highlight": s = f'<mark style="background:{h.escape(a.get("color") or "#fde68a")}">{s}</mark>'
                    elif mt == "link":
                        href = a.get("href", "")
                        if href.startswith(("http://", "https://", "mailto:", "#")):
                            s = f'<a href="{h.escape(href)}">{s}</a>'
                    elif mt == "textStyle":
                        st = ";".join(f"{k}:{h.escape(str(a[v]))}" for k, v in
                                      (("color", "color"), ("font-family", "fontFamily"), ("font-size", "fontSize")) if a.get(v))
                        if st: s = f'<span style="{st}">{s}</span>'
                out.append(s)
            elif t == "hardBreak":
                out.append("<br>")
            elif t == "citation":
                out.append(f'<span class="cite">{h.escape(self.ctx.cite(n.get("attrs") or {}))}</span>')
            elif t == "footnote":
                i = self.ctx.add_footnote((n.get("attrs") or {}).get("text", ""))
                out.append(f'<sup><a href="#fn{i}" id="fnref{i}">{i}</a></sup>')
            elif t == "inlineEquation":
                out.append(f'<span class="math">{h.escape((n.get("attrs") or {}).get("latex", ""))}</span>')
        return "".join(out)

    def _pattrs(self, n):
        a = n.get("attrs") or {}
        st = f' style="text-align:{a["textAlign"]}"' if a.get("textAlign") else ""
        d = f' dir="{a["dir"]}"' if a.get("dir") in ("rtl", "ltr") else ' dir="auto"'
        return st + d

    def block(self, n) -> str:
        t, a = n.get("type"), n.get("attrs") or {}
        kids = lambda: "".join(self.block(c) for c in n.get("content", []))
        if t == "paragraph":
            return f"<p{self._pattrs(n)}>{self.inline(n.get('content')) or '<br>'}</p>"
        if t == "heading":
            lvl = max(1, min(6, int(a.get("level", 1))))
            return f"<h{lvl}{self._pattrs(n)}>{self.inline(n.get('content'))}</h{lvl}>"
        if t in ("bulletList", "taskList"):
            return f"<ul>{kids()}</ul>"
        if t == "orderedList":
            return f"<ol>{kids()}</ol>"
        if t in ("listItem", "taskItem"):
            return f"<li>{kids()}</li>"
        if t == "blockquote":
            return f"<blockquote>{kids()}</blockquote>"
        if t == "codeBlock":
            return f'<pre dir="ltr"><code>{h.escape(node_text(n))}</code></pre>'
        if t == "horizontalRule":
            return "<hr>"
        if t == "pageBreak":
            return '<div class="page-break"></div>'
        if t in ("image", "chart"):
            src = a.get("src") or a.get("image") or ""
            if not src:
                return ""
            cap = f"<figcaption>{h.escape(self.ctx.next_figure_label(a['caption']))}</figcaption>" if a.get("caption") else ""
            w = f' style="width:{h.escape(str(a["width"]))}"' if a.get("width") else ""
            return f'<figure class="align-{h.escape(a.get("align","center"))}"><img src="{h.escape(src)}" alt="{h.escape(a.get("alt",""))}"{w}>{cap}</figure>'
        if t == "table":
            rows = []
            for r in n.get("content", []):
                cells = []
                for c in r.get("content", []):
                    ca = c.get("attrs") or {}
                    tag = "th" if c["type"] == "tableHeader" else "td"
                    span = "".join(f' {k}="{int(ca[k])}"' for k in ("colspan", "rowspan") if int(ca.get(k, 1)) > 1)
                    bg = f' style="background:{h.escape(ca["backgroundColor"])}"' if ca.get("backgroundColor") else ""
                    cells.append(f"<{tag}{span}{bg}>{''.join(self.block(x) for x in c.get('content', []))}</{tag}>")
                rows.append("<tr>" + "".join(cells) + "</tr>")
            cap = f"<caption>{h.escape(self.ctx.next_table_label(a['caption']))}</caption>" if a.get("caption") else ""
            return f"<table>{cap}{''.join(rows)}</table>"
        if t == "equation":
            return f'<div class="equation" dir="ltr">{h.escape(a.get("latex",""))}</div>'
        if t == "coverPage":
            m = {**self.ctx.metadata, **a}
            parts = [f'<div class="cover-org">{h.escape(m[k])}</div>' for k in ("university", "college", "department") if m.get(k)]
            parts.append(f'<h1 class="cover-title">{h.escape(m.get("title") or self.ctx.title)}</h1>')
            parts += [f'<div class="cover-meta">{h.escape(m[k])}</div>' for k in ("author", "stage", "supervisor", "date") if m.get(k)]
            return f'<section class="cover">{"".join(parts)}</section><div class="page-break"></div>'
        if t == "tableOfContents":
            items = "".join(f'<li class="lvl{s["level"]}"><a href="#{h.escape(s["anchor"])}">{h.escape(s["heading"])}</a></li>' for s in self.ctx.sections)
            return f'<nav class="toc"><h1>{self.ctx.L["toc"]}</h1><ul>{items}</ul></nav>'
        if t in ("figureList", "tableList"):
            items = self.ctx.figures if t == "figureList" else self.ctx.tables
            lab = self.ctx.L["figure" if t == "figureList" else "table"]
            title = self.ctx.L["figures" if t == "figureList" else "tables"]
            return f"<h1>{title}</h1><ul>" + "".join(f"<li>{lab} {i}: {h.escape(c)}</li>" for i, c in enumerate(items, 1)) + "</ul>"
        if t == "bibliography":
            return f'<section class="bibliography"><h1>{self.ctx.L["references"]}</h1>' + "".join(
                f'<p class="ref" dir="auto">{_ital(r)}</p>' for r in self.ctx.bibliography()) + "</section>"
        if t == "caption":
            return f'<p class="caption">{self.inline(n.get("content"))}</p>'
        return kids()

    def render(self) -> str:
        lay = self.ctx.layout
        w, hgt = page_dims_mm(lay)
        m = lay["margins_mm"]
        body = "".join(self.block(n) for n in self.ctx.content.get("content", []))
        if self.ctx.footnotes:
            body += f'<section class="footnotes"><h2>{self.ctx.L["notes"]}</h2><ol>' + "".join(
                f'<li id="fn{i}">{h.escape(f)}</li>' for i, f in enumerate(self.ctx.footnotes, 1)) + "</ol></section>"
        d = "rtl" if self.ctx.rtl else "ltr"
        font = h.escape(lay.get("fontFamily", "Amiri"))
        return f"""<!DOCTYPE html>
<html lang="{h.escape(self.ctx.language)}" dir="{d}"><head><meta charset="utf-8"><title>{h.escape(self.ctx.title)}</title>
<style>
@page {{ size: {w}mm {hgt}mm; margin: {m['top']}mm {m['right']}mm {m['bottom']}mm {m['left']}mm; }}
body {{ font-family: '{font}', 'Amiri', 'Noto Naskh Arabic', serif; font-size: {lay.get('fontSize',14)}pt; line-height: {lay.get('lineHeight',1.5)}; columns: {lay.get('columns',1)}; }}
h1,h2,h3,h4,h5,h6 {{ color: {h.escape(lay.get('headingColor','#1e3a8a'))}; break-after: avoid; }}
table {{ border-collapse: collapse; width: 100%; margin: 8px 0; }} td,th {{ border: 1px solid #64748b; padding: 4px 6px; }}
th {{ background: #dbeafe; }} figure {{ text-align: center; margin: 10px 0; }} img {{ max-width: 100%; }}
figcaption, caption, .caption {{ font-size: .9em; text-align: center; }} .page-break {{ break-after: page; }}
.cover {{ text-align: center; min-height: 80vh; }} .cover-title {{ margin: 30vh 0 15vh; font-size: 2em; }}
.ref {{ padding-inline-start: 2em; text-indent: -2em; }} .equation {{ text-align: center; font-style: italic; }}
</style></head><body>{body}</body></html>"""


def export_html(ctx: ExportContext) -> str:
    return HtmlExporter(ctx).render()


def _md_inline(ctx, nodes) -> str:
    out = []
    for n in nodes or []:
        t = n.get("type")
        if t == "text" and not _deleted(n):
            s = n.get("text", "")
            for m in n.get("marks") or []:
                mt = m.get("type")
                if mt == "bold": s = f"**{s}**"
                elif mt == "italic": s = f"*{s}*"
                elif mt == "strike": s = f"~~{s}~~"
                elif mt == "code": s = f"`{s}`"
                elif mt == "link": s = f"[{s}]({(m.get('attrs') or {}).get('href','')})"
            out.append(s)
        elif t == "hardBreak":
            out.append("  \n")
        elif t == "citation":
            out.append(ctx.cite(n.get("attrs") or {}))
        elif t == "footnote":
            out.append(f"[^{ctx.add_footnote((n.get('attrs') or {}).get('text',''))}]")
        elif t == "inlineEquation":
            out.append(f"${(n.get('attrs') or {}).get('latex','')}$")
    return "".join(out)


def export_markdown(ctx: ExportContext) -> str:
    lines = []

    def block(n, depth=0, prefix=""):
        t, a = n.get("type"), n.get("attrs") or {}
        if t == "paragraph":
            lines.append(prefix + _md_inline(ctx, n.get("content"))); lines.append("")
        elif t == "heading":
            lines.append("#" * int(a.get("level", 1)) + " " + _md_inline(ctx, n.get("content"))); lines.append("")
        elif t in ("bulletList", "orderedList", "taskList"):
            for i, item in enumerate(n.get("content", []), 1):
                mark = f"{i}." if t == "orderedList" else "-"
                for j, c in enumerate(item.get("content", [])):
                    if c["type"] == "paragraph":
                        lines.append("  " * depth + (mark + " " if j == 0 else "  ") + _md_inline(ctx, c.get("content")))
                    else:
                        block(c, depth + 1)
            lines.append("")
        elif t == "blockquote":
            for c in n.get("content", []):
                block(c, depth, "> ")
        elif t == "codeBlock":
            lines.extend(["```" + (a.get("language") or ""), node_text(n), "```", ""])
        elif t == "horizontalRule":
            lines.extend(["---", ""])
        elif t in ("image", "chart"):
            src = a.get("src") or a.get("image") or ""
            cap = ctx.next_figure_label(a["caption"]) if a.get("caption") else a.get("alt", "")
            if src:
                lines.extend([f"![{cap}]({src})", f"*{cap}*" if cap else "", ""])
        elif t == "table":
            rows = n.get("content", [])
            for ri, r in enumerate(rows):
                cells = [" ".join(node_text(x) for x in c.get("content", [])).replace("|", "\\|") for c in r.get("content", [])]
                lines.append("| " + " | ".join(cells) + " |")
                if ri == 0:
                    lines.append("|" + "---|" * len(cells))
            if a.get("caption"):
                lines.append(f"*{ctx.next_table_label(a['caption'])}*")
            lines.append("")
        elif t == "equation":
            lines.extend(["$$", a.get("latex", ""), "$$", ""])
        elif t == "coverPage":
            m = {**ctx.metadata, **a}
            lines.extend([f"# {m.get('title') or ctx.title}", ""] + [f"**{m[k]}**  " for k in ("university", "department", "author", "supervisor", "date") if m.get(k)] + [""])
        elif t == "tableOfContents":
            lines.extend([f"## {ctx.L['toc']}", ""] + ["  " * (s["level"] - 1) + f"- {s['heading']}" for s in ctx.sections] + [""])
        elif t == "bibliography":
            lines.extend([f"## {ctx.L['references']}", ""] + [f"- {r}" for r in ctx.bibliography()] + [""])
        elif t in ("figureList", "tableList"):
            items = ctx.figures if t == "figureList" else ctx.tables
            lines.extend([f"## {ctx.L['figures' if t == 'figureList' else 'tables']}", ""] + [f"{i}. {c}" for i, c in enumerate(items, 1)] + [""])
        else:
            for c in n.get("content", []) or []:
                block(c, depth)
    for n in ctx.content.get("content", []):
        block(n)
    for i, f in enumerate(ctx.footnotes, 1):
        lines.append(f"[^{i}]: {f}")
    return "\n".join(lines).strip() + "\n"


def export_txt(ctx: ExportContext) -> str:
    return plain_text(ctx.content) + "\n"
