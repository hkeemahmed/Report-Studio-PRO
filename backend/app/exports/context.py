"""Shared export context: resolves citations, numbers figures/tables/footnotes, builds lists."""
import base64
import re
from dataclasses import dataclass, field

from ..documents.schema import collect, extract_sections, node_text, normalize_layout
from ..references.styles import format_reference, in_text, sort_for_bibliography

LABELS = {"ar": {"figure": "شكل", "table": "جدول", "toc": "جدول المحتويات", "figures": "قائمة الأشكال",
                 "tables": "قائمة الجداول", "references": "المراجع", "notes": "الهوامش", "page": "صفحة"},
          "en": {"figure": "Figure", "table": "Table", "toc": "Table of Contents", "figures": "List of Figures",
                 "tables": "List of Tables", "references": "References", "notes": "Notes", "page": "Page"}}


@dataclass
class ExportContext:
    title: str
    content: dict
    layout: dict
    language: str = "ar"
    metadata: dict = field(default_factory=dict)
    sources: dict = field(default_factory=dict)  # id -> source dict
    citation_style: str = "apa"
    citation_order: list = field(default_factory=list)
    figures: list = field(default_factory=list)
    tables: list = field(default_factory=list)
    footnotes: list = field(default_factory=list)
    sections: list = field(default_factory=list)

    def __post_init__(self):
        self.layout = normalize_layout(self.layout)
        self.citation_style = (self.layout.get("citationStyle") or self.citation_style).lower()
        for c in collect(self.content, "citation"):
            sid = (c.get("attrs") or {}).get("sourceId")
            if sid in self.sources and sid not in self.citation_order:
                self.citation_order.append(sid)
        for n in collect(self.content, "image") + collect(self.content, "chart"):
            cap = (n.get("attrs") or {}).get("caption", "")
            if cap:
                self.figures.append(cap)
        for n in collect(self.content, "table"):
            cap = (n.get("attrs") or {}).get("caption", "")
            if cap:
                self.tables.append(cap)
        self.sections = extract_sections(self.content)
        self._fig_i = self._tab_i = 0

    @property
    def L(self):
        return LABELS["ar" if self.language.startswith("ar") else "en"]

    @property
    def rtl(self) -> bool:
        return self.layout.get("direction", "rtl") == "rtl"

    def next_figure_label(self, caption: str) -> str:
        self._fig_i += 1
        return f"{self.L['figure']} {self._fig_i}: {caption}"

    def next_table_label(self, caption: str) -> str:
        self._tab_i += 1
        return f"{self.L['table']} {self._tab_i}: {caption}"

    def cite(self, attrs: dict) -> str:
        sid = attrs.get("sourceId")
        src = self.sources.get(sid)
        if not src:
            return "[?]"
        n = self.citation_order.index(sid) + 1
        return in_text(src, self.citation_style, n, attrs.get("locator", ""))

    def add_footnote(self, text: str) -> int:
        self.footnotes.append(text)
        return len(self.footnotes)

    def bibliography(self) -> list[str]:
        srcs = [self.sources[s] for s in self.citation_order]
        # include uncited sources explicitly attached to the document
        for sid, s in self.sources.items():
            if sid not in self.citation_order and s.get("_include"):
                srcs.append(s)
        numeric = self.citation_style in ("ieee", "vancouver")
        ordered = sort_for_bibliography(srcs, self.citation_style)
        return [format_reference(s, self.citation_style, i + 1 if numeric else None) for i, s in enumerate(ordered)]


def decode_data_uri(src: str) -> bytes | None:
    m = re.match(r"^data:image/[a-z+]+;base64,(.*)$", src or "", re.S)
    if not m:
        return None
    try:
        return base64.b64decode(m.group(1))
    except ValueError:
        return None


def split_italic_markers(text: str):
    """Reference strings mark italics with *...*; yields (segment, italic)."""
    parts = re.split(r"(\*[^*]+\*)", text)
    for p in parts:
        if p.startswith("*") and p.endswith("*") and len(p) > 2:
            yield p[1:-1], True
        elif p:
            yield p, False


__all__ = ["ExportContext", "decode_data_uri", "split_italic_markers", "node_text"]
