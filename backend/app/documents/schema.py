"""Document content = ProseMirror/Tiptap JSON. Layout = separate dict (page size, margins, header/footer).

This module validates content, extracts plain text/sections, and normalizes layout.
"""
import re
import unicodedata

BLOCK_TYPES = {"doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock",
               "horizontalRule", "image", "table", "tableRow", "tableHeader", "tableCell", "pageBreak", "equation",
               "chart", "tableOfContents", "bibliography", "figureList", "tableList", "coverPage", "taskList",
               "taskItem", "caption"}
INLINE_TYPES = {"text", "hardBreak", "citation", "footnote", "inlineEquation"}
ALLOWED_TYPES = BLOCK_TYPES | INLINE_TYPES
MAX_DEPTH = 40

PAGE_SIZES_MM = {"A4": (210, 297), "A3": (297, 420), "A5": (148, 210), "Letter": (215.9, 279.4), "Legal": (215.9, 355.6)}

DEFAULT_LAYOUT = {
    "pageSize": "A4", "width_mm": 210, "height_mm": 297, "orientation": "portrait",
    "margins_mm": {"top": 25, "bottom": 25, "left": 25, "right": 25},
    "columns": 1, "pageBorder": False,
    "header": {"text": "", "align": "center"}, "footer": {"text": "", "align": "center"},
    "pageNumbers": {"enabled": True, "position": "footer", "align": "center", "format": "arabic", "start": 1},
    "direction": "rtl", "fontFamily": "Amiri", "fontSize": 14, "lineHeight": 1.5,
    "headingColor": "#1e3a8a", "differentFirstPage": True,
}


class SchemaError(ValueError):
    pass


def empty_doc() -> dict:
    return {"type": "doc", "content": [{"type": "paragraph"}]}


def validate_content(node: dict, depth: int = 0) -> None:
    if depth > MAX_DEPTH:
        raise SchemaError("Document nesting too deep")
    if not isinstance(node, dict) or "type" not in node:
        raise SchemaError("Each node must be an object with a 'type'")
    if node["type"] not in ALLOWED_TYPES:
        raise SchemaError(f"Unsupported node type: {node['type']}")
    if depth == 0 and node["type"] != "doc":
        raise SchemaError("Root node must be 'doc'")
    if node["type"] == "text" and not isinstance(node.get("text", ""), str):
        raise SchemaError("text node requires string 'text'")
    if node["type"] == "image":
        src = (node.get("attrs") or {}).get("src", "")
        if src and not re.match(r"^(data:image/(png|jpe?g|gif|webp);base64,|https?://|asset:)", src):
            raise SchemaError("Image src must be data URI, http(s) URL or asset: reference")
    for child in node.get("content", []) or []:
        validate_content(child, depth + 1)


def normalize_layout(layout: dict | None) -> dict:
    out = {**DEFAULT_LAYOUT, **(layout or {})}
    out["margins_mm"] = {**DEFAULT_LAYOUT["margins_mm"], **((layout or {}).get("margins_mm") or {})}
    out["pageNumbers"] = {**DEFAULT_LAYOUT["pageNumbers"], **((layout or {}).get("pageNumbers") or {})}
    out["header"] = {**DEFAULT_LAYOUT["header"], **((layout or {}).get("header") or {})}
    out["footer"] = {**DEFAULT_LAYOUT["footer"], **((layout or {}).get("footer") or {})}
    if out["pageSize"] in PAGE_SIZES_MM:  # named size wins; "Custom" uses width_mm/height_mm
        out["width_mm"], out["height_mm"] = PAGE_SIZES_MM[out["pageSize"]]
    w, h = float(out["width_mm"]), float(out["height_mm"])
    if not (50 <= w <= 1200 and 50 <= h <= 1200):
        raise SchemaError("Page size out of range (50-1200mm)")
    for k, v in out["margins_mm"].items():
        if not (0 <= float(v) <= min(w, h) / 2 - 5):
            raise SchemaError(f"Margin '{k}' out of range")
    return out


def page_dims_mm(layout: dict) -> tuple[float, float]:
    w, h = float(layout["width_mm"]), float(layout["height_mm"])
    if layout.get("orientation") == "landscape":
        w, h = max(w, h), min(w, h)
    else:
        w, h = min(w, h), max(w, h)
    return w, h


def is_deleted(node: dict) -> bool:
    """Text marked as a tracked deletion is not part of the document's final content."""
    return any(m.get("type") == "deletion" for m in node.get("marks") or [])


def node_text(node: dict) -> str:
    t = node.get("type")
    if t == "text":
        return "" if is_deleted(node) else node.get("text", "")
    if t == "hardBreak":
        return "\n"
    if t in ("equation", "inlineEquation"):
        return (node.get("attrs") or {}).get("latex", "")
    if t == "footnote":
        return ""
    return "".join(node_text(c) for c in node.get("content", []) or [])


def plain_text(doc: dict) -> str:
    lines = []

    def walk(n):
        if n.get("type") in ("paragraph", "heading", "codeBlock", "caption"):
            lines.append(node_text(n))
        elif n.get("type") == "tableRow":
            lines.append("\t".join(node_text(c) for c in n.get("content", [])))
        else:
            for c in n.get("content", []) or []:
                walk(c)
    walk(doc)
    return "\n".join(lines).strip()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).strip().lower()
    return re.sub(r"[^\w؀-ۿ]+", "-", text).strip("-")[:60] or "section"


def extract_sections(doc: dict) -> list[dict]:
    out = []
    for i, n in enumerate(doc.get("content", []) or []):
        if n.get("type") == "heading":
            text = node_text(n).strip()
            if text:
                out.append({"position": i, "level": int((n.get("attrs") or {}).get("level", 1)),
                            "heading": text[:500], "anchor": slugify(text)})
    return out


def collect(doc: dict, type_name: str) -> list[dict]:
    found = []

    def walk(n):
        if n.get("type") == type_name:
            found.append(n)
        for c in n.get("content", []) or []:
            walk(c)
    walk(doc)
    return found


def detect_direction(text: str) -> str:
    """First strong character rule (Unicode bidi P2/P3)."""
    for ch in text:
        b = unicodedata.bidirectional(ch)
        if b in ("R", "AL"):
            return "rtl"
        if b == "L":
            return "ltr"
    return ""
