"""Rule-based writing quality checks (works offline, no AI). Grammar correction uses the AI 'correct' action.
Plagiarism detection is intentionally NOT claimed: it needs a dedicated service + comparison corpus."""
import re
from collections import Counter

from ..documents.schema import extract_sections, plain_text

EXPECTED = {
    "academic": [("مقدمة", "introduction"), ("خاتمة", "conclusion"), ("مراجع", "references")],
    "research": [("ملخص", "abstract"), ("مقدمة", "introduction"), ("منهج", "method"), ("نتائج", "results"), ("خاتمة", "conclusion")],
    "scientific": [("ملخص", "abstract"), ("مقدمة", "introduction"), ("نتائج", "results"), ("مناقشة", "discussion")],
    "laboratory": [("هدف", "aim"), ("نتائج", "results"), ("استنتاج", "conclusion")],
}


def review_document(doc: dict, report_type: str = "academic") -> dict:
    text = plain_text(doc)
    issues = []
    for m in re.finditer(r"\b(\w+)(\s+\1\b)+", text, re.I | re.U):
        issues.append({"type": "repeated_word", "severity": "warning", "text": m.group(0), "offset": m.start()})
    for m in re.finditer(r"[ \t]{2,}", text):
        issues.append({"type": "double_space", "severity": "info", "text": m.group(0), "offset": m.start()})
    for m in re.finditer(r"\s+([،,؛;:.!?؟])", text):
        issues.append({"type": "space_before_punctuation", "severity": "info", "text": m.group(0), "offset": m.start()})
    for m in re.finditer(r"([،,؛;])(?=[^\s\d])", text):
        issues.append({"type": "missing_space_after_punctuation", "severity": "info", "text": m.group(0), "offset": m.start()})
    if re.search(r"[؀-ۿ][^.\n]*\?", text):
        for m in re.finditer(r"(?<=[؀-ۿ] )\?|(?<=[؀-ۿ])\?", text):
            issues.append({"type": "latin_question_mark_in_arabic", "severity": "info", "text": "?", "suggestion": "؟", "offset": m.start()})
    sentences = [s.strip() for s in re.split(r"(?<=[.!?؟])\s+|\n", text) if s.strip()]
    for s, n in Counter(s for s in sentences if len(s) > 25).items():
        if n > 1:
            issues.append({"type": "repeated_sentence", "severity": "warning", "text": s[:200], "count": n})
    long = [s for s in sentences if len(s.split()) > 45]
    for s in long[:20]:
        issues.append({"type": "long_sentence", "severity": "info", "text": s[:200], "words": len(s.split())})
    sections = extract_sections(doc)
    heads = " ".join(s["heading"].lower() for s in sections)
    has_bib = '"bibliography"' in str(doc).replace("'", '"')
    for ar, en in EXPECTED.get(report_type, EXPECTED["academic"]):
        if ar not in heads and en not in heads and not (en == "references" and has_bib):
            issues.append({"type": "missing_section", "severity": "warning", "text": f"{ar} / {en}"})
    # empty sections: heading followed directly by another heading or end
    blocks = doc.get("content", [])
    for i, b in enumerate(blocks):
        if b.get("type") == "heading":
            nxt = blocks[i + 1:i + 2]
            empty = not nxt or nxt[0].get("type") == "heading" or (
                nxt[0].get("type") == "paragraph" and not plain_text({"content": [nxt[0]]}) and
                (len(blocks) <= i + 2 or blocks[i + 2].get("type") in ("heading", "pageBreak", "bibliography")))
            if empty:
                issues.append({"type": "empty_section", "severity": "warning",
                               "text": plain_text({"content": [b]})})
    words = re.findall(r"[\w؀-ۿ]+", text)
    uniq = len({w.lower() for w in words})
    avg_len = (sum(len(s.split()) for s in sentences) / len(sentences)) if sentences else 0
    score = 10.0
    score -= min(3, sum(1 for i in issues if i["severity"] == "warning") * 0.5)
    score -= min(2, sum(1 for i in issues if i["severity"] == "info") * 0.1)
    if avg_len > 35:
        score -= 1
    return {"issues": issues, "stats": {"words": len(words), "unique_words": uniq, "sentences": len(sentences),
                                        "avg_sentence_words": round(avg_len, 1), "sections": len(sections),
                                        "lexical_diversity": round(uniq / len(words), 3) if words else 0,
                                        "reading_minutes": round(len(words) / 200, 1)},
            "score": round(max(0, score), 1),
            "note": "Rule-based checks. Plagiarism detection requires a dedicated service and is not performed."}
