"""LaTeX -> MathML (latex2mathml) -> OMML, so equations are native, editable Word math."""
import xml.etree.ElementTree as ET

from latex2mathml.converter import convert

M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NARY = {"∑", "∏", "∫", "∬", "∭", "∮", "⋃", "⋂"}


def _tag(e):
    return e.tag.split("}")[-1]


def _r(text):
    return f'<m:r><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">{_esc(text)}</m:t></m:r>'


def _esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _e(x):
    return f"<m:e>{x}</m:e>"


def conv(e) -> str:
    t, ch = _tag(e), list(e)
    if t in ("mi", "mn", "mo", "mtext", "ms"):
        return _r(e.text or "")
    if t == "mspace":
        return _r(" ")
    if t in ("math", "mrow", "mstyle", "semantics", "mpadded", "mphantom"):
        out, i = "", 0
        while i < len(ch):
            c = ch[i]
            # n-ary operator with limits followed by its operand
            if _tag(c) in ("munderover", "msubsup", "munder", "msub", "msup", "mover") and len(list(c)) and \
                    _tag(list(c)[0]) == "mo" and (list(c)[0].text or "") in NARY:
                operand = conv(ch[i + 1]) if i + 1 < len(ch) else ""
                out += _nary(c, operand)
                i += 2
                continue
            out += conv(c)
            i += 1
        return out
    if t == "mfrac":
        return f"<m:f><m:num>{conv(ch[0])}</m:num><m:den>{conv(ch[1])}</m:den></m:f>"
    if t == "msqrt":
        return f'<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>{_e("".join(conv(c) for c in ch))}</m:rad>'
    if t == "mroot":
        return f"<m:rad><m:deg>{conv(ch[1])}</m:deg>{_e(conv(ch[0]))}</m:rad>"
    if t == "msup":
        return f"<m:sSup>{_e(conv(ch[0]))}<m:sup>{conv(ch[1])}</m:sup></m:sSup>"
    if t == "msub":
        return f"<m:sSub>{_e(conv(ch[0]))}<m:sub>{conv(ch[1])}</m:sub></m:sSub>"
    if t == "msubsup":
        return f"<m:sSubSup>{_e(conv(ch[0]))}<m:sub>{conv(ch[1])}</m:sub><m:sup>{conv(ch[2])}</m:sup></m:sSubSup>"
    if t in ("munder", "mover", "munderover"):
        base = conv(ch[0])
        if t == "mover":
            return f'<m:acc><m:accPr><m:chr m:val="{_esc(list(ch[1].itertext())[0] if list(ch[1].itertext()) else "¯")}"/></m:accPr>{_e(base)}</m:acc>'
        if t == "munder":
            return f"<m:limLow>{_e(base)}<m:lim>{conv(ch[1])}</m:lim></m:limLow>"
        return f"<m:limLow>{_e(f'<m:limUpp>{_e(base)}<m:lim>{conv(ch[2])}</m:lim></m:limUpp>')}<m:lim>{conv(ch[1])}</m:lim></m:limLow>"
    if t == "mfenced":
        o, c = e.get("open", "("), e.get("close", ")")
        return f'<m:d><m:dPr><m:begChr m:val="{_esc(o)}"/><m:endChr m:val="{_esc(c)}"/></m:dPr>{"".join(_e(conv(x)) for x in ch)}</m:d>'
    if t == "mtable":
        rows = "".join("<m:mr>" + "".join(_e(conv(td)) for td in tr) + "</m:mr>" for tr in ch)
        return f"<m:m>{rows}</m:m>"
    return "".join(conv(c) for c in ch) or _r(e.text or "")


def _nary(c, operand):
    k = list(c)
    op = k[0].text
    t = _tag(c)
    sub = conv(k[1]) if t in ("munderover", "msubsup", "munder", "msub") and len(k) > 1 else ""
    sup = conv(k[2]) if t in ("munderover", "msubsup") and len(k) > 2 else (conv(k[1]) if t in ("msup", "mover") else "")
    hide = ('<m:subHide m:val="1"/>' if not sub else "") + ('<m:supHide m:val="1"/>' if not sup else "")
    return f'<m:nary><m:naryPr><m:chr m:val="{op}"/>{hide}</m:naryPr><m:sub>{sub}</m:sub><m:sup>{sup}</m:sup>{_e(operand)}</m:nary>'


def latex_to_omml(latex: str) -> str:
    """Returns an <m:oMath> XML string (namespaces declared) or raises ValueError."""
    mathml = convert(latex)
    root = ET.fromstring(mathml)
    body = conv(root)
    return f'<m:oMath xmlns:m="{M}" xmlns:w="{W}">{body}</m:oMath>'
