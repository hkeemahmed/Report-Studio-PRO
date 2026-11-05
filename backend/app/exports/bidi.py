"""Word-level bidirectional layout + Arabic shaping for PDF rendering.

Implements the parts of UAX#9 needed for document text: paragraph base direction, LTR/RTL runs
(numbers and Latin stay left-to-right inside Arabic), mirrored brackets, and Arabic contextual
shaping via arabic_reshaper. Line breaking happens in logical order; reordering is per line.
"""
import unicodedata

import arabic_reshaper

_reshaper = arabic_reshaper.ArabicReshaper({"delete_harakat": False, "support_ligatures": True})
MIRROR = str.maketrans("()[]{}<>«»", ")(][}{><»«")


def char_class(ch: str) -> str:
    b = unicodedata.bidirectional(ch)
    if b in ("R", "AL"):
        return "R"
    if b == "L":
        return "L"
    if b in ("EN", "AN"):
        return "N"  # number
    return "O"  # neutral


def word_class(word: str) -> str:
    classes = {char_class(c) for c in word}
    if "R" in classes:
        return "R"
    if "L" in classes:
        return "L"
    if "N" in classes:
        return "N"
    return "O"


def shape(text: str) -> str:
    return _reshaper.reshape(text) if any(char_class(c) == "R" for c in text) else text


def visual_word(text: str, rtl_run: bool) -> str:
    """Return the glyph string for a token as it should be drawn left->right."""
    if not rtl_run:
        return text
    s = shape(text)
    # Reverse characters but keep embedded digit/latin sequences in LTR order
    out, buf = [], []
    for ch in s:
        if char_class(ch) in ("L", "N"):
            buf.append(ch)
        else:
            if buf:
                out.append("".join(buf)); buf = []
            out.append(ch.translate(MIRROR))
    if buf:
        out.append("".join(buf))
    return "".join(reversed(out))


def reorder_line(tokens: list, base_rtl: bool) -> list:
    """tokens: list of objects with .text (a word or space). Returns list of (token, rtl_run) visual order."""
    n = len(tokens)
    cls = [word_class(t.text) for t in tokens]
    # resolve: numbers inside RTL count as LTR runs, neutrals take direction of surrounding strong
    strong = ["L" if c in ("L", "N") else ("R" if c == "R" else None) for c in cls]
    if not base_rtl:
        strong = ["R" if c == "R" else ("L" if c in ("L", "N") else None) for c in cls]
    resolved = []
    base = "R" if base_rtl else "L"
    for i in range(n):
        if strong[i]:
            resolved.append(strong[i])
            continue
        prev = next((strong[j] for j in range(i - 1, -1, -1) if strong[j]), base)
        nxt = next((strong[j] for j in range(i + 1, n) if strong[j]), base)
        resolved.append(prev if prev == nxt else base)
    # group runs
    runs, cur, cur_dir = [], [], None
    for t, d in zip(tokens, resolved):
        if d != cur_dir and cur:
            runs.append((cur_dir, cur)); cur = []
        cur_dir = d
        cur.append(t)
    if cur:
        runs.append((cur_dir, cur))
    if base_rtl:
        runs.reverse()
    out = []
    for d, toks in runs:
        seq = list(reversed(toks)) if d == "R" else toks
        out.extend((t, d == "R") for t in seq)
    return out
