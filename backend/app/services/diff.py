import difflib
import re

from ..documents.schema import plain_text


def compare_docs(a: dict, b: dict) -> dict:
    """Word-level diff between two documents' text (used by Compare Documents and sync conflicts)."""
    ta, tb = plain_text(a), plain_text(b)
    wa, wb = re.findall(r"\S+|\n", ta), re.findall(r"\S+|\n", tb)
    sm = difflib.SequenceMatcher(a=wa, b=wb, autojunk=False)
    ops = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            ops.append({"op": "equal", "text": " ".join(wa[i1:i2])})
        else:
            if i2 > i1:
                ops.append({"op": "delete", "text": " ".join(wa[i1:i2])})
            if j2 > j1:
                ops.append({"op": "insert", "text": " ".join(wb[j1:j2])})
    return {"similarity": round(sm.ratio(), 4), "ops": ops,
            "stats": {"inserted": sum(len(o["text"].split()) for o in ops if o["op"] == "insert"),
                      "deleted": sum(len(o["text"].split()) for o in ops if o["op"] == "delete")}}
