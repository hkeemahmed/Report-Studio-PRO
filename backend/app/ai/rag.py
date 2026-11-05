"""RAG: extract -> chunk -> embed -> store -> retrieve -> grounded answer with verified citations."""
import io
import math
import re
from collections import Counter

from docx import Document as DocxDocument
from pypdf import PdfReader

SUPPORTED = {"application/pdf": "pdf", "text/plain": "txt", "text/markdown": "txt",
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"}


def extract_text(data: bytes, kind: str) -> list[tuple[int, str]]:
    """Returns [(page_number, text)]. DOCX/TXT are a single 'page' 1."""
    if kind == "pdf":
        reader = PdfReader(io.BytesIO(data))
        return [(i + 1, (p.extract_text() or "").strip()) for i, p in enumerate(reader.pages)]
    if kind == "docx":
        d = DocxDocument(io.BytesIO(data))
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            for r in t.rows:
                parts.append("\t".join(c.text for c in r.cells))
        return [(1, "\n".join(parts))]
    if kind == "txt":
        for enc in ("utf-8", "utf-16", "cp1256", "latin-1"):
            try:
                return [(1, data.decode(enc))]
            except UnicodeDecodeError:
                continue
    raise ValueError("Unsupported file type")


def chunk_pages(pages: list[tuple[int, str]], size: int = 900, overlap: int = 150) -> list[dict]:
    chunks = []
    for page, text in pages:
        text = re.sub(r"[ \t]+", " ", text).strip()
        if not text:
            continue
        start = 0
        while start < len(text):
            end = min(len(text), start + size)
            if end < len(text):  # break on sentence / whitespace boundary
                cut = max(text.rfind(". ", start, end), text.rfind(".\n", start, end), text.rfind("۔", start, end),
                          text.rfind("\n", start, end))
                if cut > start + size // 2:
                    end = cut + 1
                else:
                    sp = text.rfind(" ", start, end)
                    end = sp if sp > start + size // 2 else end
            chunks.append({"page": page, "text": text[start:end].strip()})
            if end >= len(text):
                break
            start = max(end - overlap, start + 1)
    return chunks


_tok = re.compile(r"[\w؀-ۿ]+", re.U)
_AR_PREFIX = re.compile(r"^(وال|بال|كال|فال|لل|ال)")


def tokens(text: str) -> list[str]:
    out = []
    for w in _tok.findall(text.lower()):
        w = _AR_PREFIX.sub("", w) if len(w) > 4 else w
        if len(w) > 1:
            out.append(w)
    return out


def bm25_scores(query: str, docs: list[str], k1=1.5, b=0.75) -> list[float]:
    """Lexical fallback when no embedding model is available (clearly reported as 'lexical')."""
    toks = [tokens(d) for d in docs]
    N = len(docs) or 1
    avg = sum(len(t) for t in toks) / N or 1
    df = Counter(w for t in toks for w in set(t))
    q = tokens(query)
    scores = []
    for t in toks:
        tf = Counter(t)
        s = 0.0
        for w in q:
            if w in tf:
                idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
                s += idf * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * len(t) / avg))
        scores.append(s)
    return scores


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def verify_citations(answer: str, valid_ids: set[str]) -> tuple[str, list[str]]:
    """Strip any [Sx] marker the model invented; return cleaned answer + list of used ids."""
    used, invalid = [], []

    def repl(m):
        sid = m.group(0)[1:-1]
        if sid in valid_ids:
            if sid not in used:
                used.append(sid)
            return m.group(0)
        invalid.append(sid)
        return ""
    cleaned = re.sub(r"\[S\d+\]", repl, answer)
    return cleaned, used
