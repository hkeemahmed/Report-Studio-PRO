"""BibTeX and RIS parsers (no external deps)."""
import re

BIB_TYPE_MAP = {"article": "article", "book": "book", "inbook": "book", "phdthesis": "thesis",
                "mastersthesis": "thesis", "misc": "website", "online": "website", "inproceedings": "article",
                "techreport": "report", "incollection": "book"}
RIS_TYPE_MAP = {"JOUR": "article", "BOOK": "book", "CHAP": "book", "THES": "thesis", "ELEC": "website",
                "WEB": "website", "RPRT": "report", "CONF": "article", "MGZN": "journal"}


def parse_name(name: str) -> dict:
    name = name.strip().strip("{}")
    if "," in name:
        fam, giv = name.split(",", 1)
        return {"family": fam.strip(), "given": giv.strip()}
    parts = name.split()
    return {"family": parts[-1], "given": " ".join(parts[:-1])} if parts else {"family": "", "given": ""}


def _bib_entries(text: str):
    i = 0
    while True:
        m = re.compile(r"@(\w+)\s*\{").search(text, i)
        if not m:
            return
        depth, j = 1, m.end()
        while j < len(text) and depth:
            depth += {"{": 1, "}": -1}.get(text[j], 0)
            j += 1
        yield m.group(1).lower(), text[m.end():j - 1]
        i = j


def _bib_fields(body: str):
    key, _, rest = body.partition(",")
    fields, i = {}, 0
    pat = re.compile(r"\s*(\w+)\s*=\s*")
    while i < len(rest):
        m = pat.match(rest, i)
        if not m:
            i += 1
            continue
        name, j = m.group(1).lower(), m.end()
        if j < len(rest) and rest[j] == "{":
            depth, k = 1, j + 1
            while k < len(rest) and depth:
                depth += {"{": 1, "}": -1}.get(rest[k], 0)
                k += 1
            val, i = rest[j + 1:k - 1], k
        elif j < len(rest) and rest[j] == '"':
            k = rest.index('"', j + 1)
            val, i = rest[j + 1:k], k + 1
        else:
            k = j
            while k < len(rest) and rest[k] not in ",\n":
                k += 1
            val, i = rest[j:k], k
        fields[name] = re.sub(r"[{}]", "", val).strip()
        while i < len(rest) and rest[i] in ", \n\r\t":
            i += 1
    return key.strip(), fields


def parse_bibtex(text: str) -> list[dict]:
    out = []
    for etype, body in _bib_entries(text):
        if etype in ("comment", "string", "preamble"):
            continue
        key, f = _bib_fields(body)
        authors = [parse_name(a) for a in re.split(r"\s+and\s+", f.get("author", "")) if a.strip()]
        out.append({
            "source_type": BIB_TYPE_MAP.get(etype, "article"), "cite_key": key, "title": f.get("title", ""),
            "authors": authors, "year": f.get("year", ""), "doi": f.get("doi", ""), "isbn": f.get("isbn", ""),
            "data": {k: v for k, v in {
                "journal": f.get("journal") or f.get("booktitle", ""), "volume": f.get("volume", ""),
                "issue": f.get("number", ""), "pages": f.get("pages", "").replace("--", "–"),
                "publisher": f.get("publisher", ""), "place": f.get("address", ""), "url": f.get("url", ""),
                "university": f.get("school", ""), "edition": f.get("edition", "")}.items() if v},
        })
    return out


def parse_ris(text: str) -> list[dict]:
    out, cur = [], None
    for line in text.splitlines():
        m = re.match(r"^([A-Z][A-Z0-9])  - ?(.*)$", line.rstrip())
        if not m:
            continue
        tag, val = m.group(1), m.group(2).strip()
        if tag == "TY":
            cur = {"source_type": RIS_TYPE_MAP.get(val, "article"), "title": "", "authors": [], "year": "",
                   "doi": "", "isbn": "", "data": {}}
        elif cur is None:
            continue
        elif tag == "ER":
            out.append(cur)
            cur = None
        elif tag in ("AU", "A1", "A2"):
            cur["authors"].append(parse_name(val))
        elif tag in ("TI", "T1"):
            cur["title"] = val
        elif tag in ("PY", "Y1", "DA") and not cur["year"]:
            cur["year"] = val[:4]
        elif tag in ("JO", "JF", "T2"):
            cur["data"]["journal"] = val
        elif tag == "VL":
            cur["data"]["volume"] = val
        elif tag == "IS":
            cur["data"]["issue"] = val
        elif tag == "SP":
            cur["data"]["pages"] = val
        elif tag == "EP":
            cur["data"]["pages"] = f"{cur['data'].get('pages','')}–{val}"
        elif tag == "PB":
            cur["data"]["publisher"] = val
        elif tag == "CY":
            cur["data"]["place"] = val
        elif tag == "UR":
            cur["data"]["url"] = val
        elif tag == "DO":
            cur["doi"] = val
        elif tag == "SN":
            cur["isbn"] = val
    return out


def validate_isbn(isbn: str) -> bool:
    s = re.sub(r"[^0-9Xx]", "", isbn)
    if len(s) == 10:
        total = sum((10 - i) * (10 if c in "Xx" else int(c)) for i, c in enumerate(s))
        return total % 11 == 0
    if len(s) == 13 and s.isdigit():
        return sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(s)) % 10 == 0
    return False


def validate_doi(doi: str) -> bool:
    return bool(re.match(r"^(https?://(dx\.)?doi\.org/)?10\.\d{4,9}/\S+$", doi.strip()))
