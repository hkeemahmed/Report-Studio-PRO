"""Similarity check against a corpus the user controls: uploaded research sources + other reports in the workspace.
This is NOT an internet plagiarism check (that needs an external service and comparison database)."""
import re

N = 7  # words per shingle


def _words(text: str) -> list[str]:
    return [w for w in re.findall(r"[\w؀-ۿ]+", text.lower()) if len(w) > 1]


def _shingles(words: list[str]) -> dict[tuple, int]:
    out = {}
    for i in range(len(words) - N + 1):
        out.setdefault(tuple(words[i:i + N]), i)
    return out


def similarity(text: str, corpus: list[dict]) -> dict:
    words = _words(text)
    mine = _shingles(words)
    if not mine:
        return {"overall_percent": 0.0, "matches": [], "checked_sources": len(corpus)}
    covered = [False] * len(words)
    matches = []
    for src in corpus:
        theirs = set(_shingles(_words(src["text"])))
        hits = [i for sh, i in mine.items() if sh in theirs]
        if not hits:
            continue
        for i in hits:
            for k in range(i, i + N):
                covered[k] = True
        hits.sort()
        passages, start, prev = [], hits[0], hits[0]
        for i in hits[1:] + [None]:
            if i is None or i > prev + N:
                passages.append(" ".join(words[start:prev + N]))
                if i is not None:
                    start = i
            if i is not None:
                prev = i
        share = len({k for i in hits for k in range(i, i + N)}) / len(words)
        matches.append({"source_type": src["type"], "source_id": src["id"], "title": src["title"],
                        "percent": round(share * 100, 1), "passages": passages[:5]})
    matches.sort(key=lambda m: -m["percent"])
    return {"overall_percent": round(sum(covered) / len(words) * 100, 1), "matches": matches[:20], "checked_sources": len(corpus),
            "note": "Compared with your uploaded sources and other reports in this workspace only (not the internet)."}
