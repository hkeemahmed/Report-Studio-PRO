"""Citation formatting for APA 7, IEEE, MLA 9, Chicago (author-date), Harvard, Vancouver.

A source is a dict: {source_type, title, authors:[{given,family}], year, doi, isbn, data:{journal, volume,
issue, pages, publisher, place, url, accessed, edition, university, degree}}
Output is plain text with *asterisks* marking italics (exporters convert them to real italics).
"""
STYLES = ("apa", "ieee", "mla", "chicago", "harvard", "vancouver")


def _initials(given: str, dot=True, space=True) -> str:
    parts = [p for p in given.replace("-", " ").split() if p]
    sep = " " if space else ""
    return sep.join(p[0].upper() + ("." if dot else "") for p in parts)


def _authors(src) -> list[dict]:
    return [a for a in (src.get("authors") or []) if a.get("family") or a.get("given")]


def _join(items, last_sep, sep=", "):
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return sep.join(items[:-1]) + last_sep + items[-1]


def _d(src):
    return src.get("data") or {}


def _tail_doi_url(src):
    if src.get("doi"):
        doi = src["doi"].removeprefix("https://doi.org/")
        return f"https://doi.org/{doi}"
    return _d(src).get("url", "")


def apa(src) -> str:
    au = _authors(src)
    names = [f"{a.get('family','')}, {_initials(a.get('given',''))}".strip(", ") for a in au]
    if len(names) > 20:
        names = names[:19] + ["... " + names[-1]]
        author = ", ".join(names)
    else:
        author = _join(names, ", & ")
    year = f"({src.get('year') or 'n.d.'})."
    d, t = _d(src), src.get("source_type", "article")
    title = src.get("title", "")
    if t in ("article", "journal"):
        vol = f", *{d['volume']}*" if d.get("volume") else ""
        iss = f"({d['issue']})" if d.get("issue") else ""
        pages = f", {d['pages']}" if d.get("pages") else ""
        body = f"{title}. *{d.get('journal','')}*{vol}{iss}{pages}."
    elif t == "book":
        ed = f" ({d['edition']} ed.)" if d.get("edition") else ""
        body = f"*{title}*{ed}. {d.get('publisher','')}.".replace(" .", "")
    elif t == "thesis":
        body = f"*{title}* [{d.get('degree','Doctoral dissertation')}, {d.get('university','')}]."
    elif t == "website":
        body = f"*{title}*. {d.get('publisher') or d.get('site','')}.".replace(" .", "")
    else:
        body = f"*{title}*. {d.get('publisher','')}.".replace(" .", "")
    tail = _tail_doi_url(src)
    return " ".join(x for x in [author, year, body, tail] if x).strip()


def ieee(src, n: int | None = None) -> str:
    au = _authors(src)
    names = [f"{_initials(a.get('given',''))} {a.get('family','')}".strip() for a in au]
    author = ", ".join(names[:6]) + " et al." if len(names) > 6 else _join(names, ", and " if len(names) > 2 else " and ")
    d, t = _d(src), src.get("source_type", "article")
    prefix = f"[{n}] " if n else ""
    if t in ("article", "journal"):
        parts = [f'"{src.get("title","")}," *{d.get("journal","")}*']
        if d.get("volume"): parts.append(f"vol. {d['volume']}")
        if d.get("issue"): parts.append(f"no. {d['issue']}")
        if d.get("pages"): parts.append(f"pp. {d['pages']}")
        if src.get("year"): parts.append(src["year"])
        s = f"{author}, " + ", ".join(parts) + "."
        if src.get("doi"): s += f" doi: {src['doi']}."
    elif t == "book":
        place = f"{d['place']}: " if d.get("place") else ""
        s = f"{author}, *{src.get('title','')}*. {place}{d.get('publisher','')}, {src.get('year','')}."
    elif t == "website":
        s = f'{author}, "{src.get("title","")}." {d.get("site","")}. Accessed: {d.get("accessed","")}. [Online]. Available: {d.get("url","")}'
    else:
        s = f"{author}, *{src.get('title','')}*, {d.get('university') or d.get('publisher','')}, {src.get('year','')}."
    return prefix + s.strip(", ").replace(" ,", ",")


def mla(src) -> str:
    au = _authors(src)
    if not au:
        author = ""
    elif len(au) == 1:
        author = f"{au[0].get('family','')}, {au[0].get('given','')}."
    elif len(au) == 2:
        author = f"{au[0].get('family','')}, {au[0].get('given','')}, and {au[1].get('given','')} {au[1].get('family','')}."
    else:
        author = f"{au[0].get('family','')}, {au[0].get('given','')}, et al."
    d, t = _d(src), src.get("source_type", "article")
    if t in ("article", "journal"):
        bits = [f"*{d.get('journal','')}*"]
        if d.get("volume"): bits.append(f"vol. {d['volume']}")
        if d.get("issue"): bits.append(f"no. {d['issue']}")
        if src.get("year"): bits.append(src["year"])
        if d.get("pages"): bits.append(f"pp. {d['pages']}")
        s = f'{author} "{src.get("title","")}." ' + ", ".join(bits) + "."
    else:
        s = f"{author} *{src.get('title','')}*. {d.get('publisher') or d.get('site','')}, {src.get('year','')}."
    tail = _tail_doi_url(src)
    return (s + (f" {tail}." if tail else "")).strip()


def chicago(src) -> str:
    au = _authors(src)
    names = []
    for i, a in enumerate(au):
        names.append(f"{a.get('family','')}, {a.get('given','')}" if i == 0 else f"{a.get('given','')} {a.get('family','')}")
    author = _join(names, ", and " if len(names) > 2 else " and ")
    d, t = _d(src), src.get("source_type", "article")
    yr = src.get("year") or "n.d."
    if t in ("article", "journal"):
        vol = f" {d['volume']}" if d.get("volume") else ""
        iss = f" ({d['issue']})" if d.get("issue") else ""
        pages = f": {d['pages']}" if d.get("pages") else ""
        s = f'{author}. {yr}. "{src.get("title","")}." *{d.get("journal","")}*{vol}{iss}{pages}.'
    else:
        place = f"{d['place']}: " if d.get("place") else ""
        s = f"{author}. {yr}. *{src.get('title','')}*. {place}{d.get('publisher','')}."
    tail = _tail_doi_url(src)
    return (s + (f" {tail}." if tail else "")).strip()


def harvard(src) -> str:
    au = _authors(src)
    names = [f"{a.get('family','')}, {_initials(a.get('given',''), space=False)}" for a in au]
    author = _join(names, " and ")
    d, t = _d(src), src.get("source_type", "article")
    yr = f"({src.get('year') or 'n.d.'})"
    if t in ("article", "journal"):
        vol = f", {d['volume']}" if d.get("volume") else ""
        iss = f"({d['issue']})" if d.get("issue") else ""
        pages = f", pp. {d['pages']}" if d.get("pages") else ""
        s = f"{author} {yr} '{src.get('title','')}', *{d.get('journal','')}*{vol}{iss}{pages}."
    else:
        place = f"{d['place']}: " if d.get("place") else ""
        s = f"{author} {yr} *{src.get('title','')}*. {place}{d.get('publisher','')}."
    if d.get("url") and not src.get("doi"):
        s += f" Available at: {d['url']}" + (f" (Accessed: {d['accessed']})." if d.get("accessed") else ".")
    elif src.get("doi"):
        s += f" doi:{src['doi']}."
    return s.strip()


def vancouver(src, n: int | None = None) -> str:
    au = _authors(src)
    names = [f"{a.get('family','')} {_initials(a.get('given',''), dot=False, space=False)}" for a in au]
    author = ", ".join(names[:6]) + (", et al." if len(names) > 6 else ".")
    d, t = _d(src), src.get("source_type", "article")
    prefix = f"{n}. " if n else ""
    if t in ("article", "journal"):
        vi = f"{d.get('volume','')}" + (f"({d['issue']})" if d.get("issue") else "")
        s = f"{author} {src.get('title','')}. {d.get('journal','')}. {src.get('year','')};{vi}:{d.get('pages','')}."
    else:
        place = f"{d['place']}: " if d.get("place") else ""
        s = f"{author} {src.get('title','')}. {place}{d.get('publisher','')}; {src.get('year','')}."
    return prefix + s.replace(";:", ";").replace(":.", ".")


def format_reference(src: dict, style: str, n: int | None = None) -> str:
    style = style.lower()
    if style == "apa": return apa(src)
    if style == "ieee": return ieee(src, n)
    if style == "mla": return mla(src)
    if style == "chicago": return chicago(src)
    if style == "harvard": return harvard(src)
    if style == "vancouver": return vancouver(src, n)
    raise ValueError(f"Unknown style: {style}")


def in_text(src: dict, style: str, n: int | None = None, locator: str = "") -> str:
    style = style.lower()
    au = _authors(src)
    if style in ("ieee", "vancouver"):
        return f"[{n}]" if style == "ieee" else f"({n})"
    fam = [a.get("family", "") for a in au]
    if not fam:
        name = src.get("title", "")[:30]
    elif len(fam) == 1:
        name = fam[0]
    elif len(fam) == 2:
        name = f"{fam[0]} {'&' if style == 'apa' else 'and'} {fam[1]}"
    else:
        name = f"{fam[0]} et al."
    yr = src.get("year") or "n.d."
    if style == "mla":
        return f"({name}{' ' + locator if locator else ''})"
    loc = f", p. {locator}" if locator else ""
    if style == "chicago":
        return f"({name} {yr}{', ' + locator if locator else ''})"
    return f"({name}, {yr}{loc})"


def sort_for_bibliography(sources: list[dict], style: str) -> list[dict]:
    """Numeric styles keep citation order; author styles sort alphabetically."""
    if style.lower() in ("ieee", "vancouver"):
        return sources
    return sorted(sources, key=lambda s: ((_authors(s) or [{"family": s.get("title", "")}])[0].get("family", "").lower(), s.get("year", "")))
