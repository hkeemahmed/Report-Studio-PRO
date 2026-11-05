from app.references.importers import parse_bibtex, parse_ris, validate_doi, validate_isbn
from app.references.styles import format_reference, in_text

from .fixtures import SOURCE

BOOK = {"source_type": "book", "title": "Artificial Intelligence: A Modern Approach", "year": "2021",
        "authors": [{"given": "Stuart", "family": "Russell"}, {"given": "Peter", "family": "Norvig"}],
        "data": {"publisher": "Pearson", "edition": "4th", "place": "Hoboken, NJ"}}


def test_apa():
    assert format_reference(SOURCE, "apa") == ("LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. *Nature*, "
                                               "*521*(7553), 436–444. https://doi.org/10.1038/nature14539")
    assert format_reference(BOOK, "apa") == "Russell, S., & Norvig, P. (2021). *Artificial Intelligence: A Modern Approach* (4th ed.). Pearson."
    assert in_text(SOURCE, "apa", locator="437") == "(LeCun et al., 2015, p. 437)"


def test_ieee_vancouver_numeric():
    assert format_reference(SOURCE, "ieee", 1) == ('[1] Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," *Nature*, '
                                                   'vol. 521, no. 7553, pp. 436–444, 2015. doi: 10.1038/nature14539.')
    assert format_reference(SOURCE, "vancouver", 2) == "2. LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436–444."
    assert in_text(SOURCE, "ieee", 3) == "[3]"


def test_mla_chicago_harvard():
    assert format_reference(SOURCE, "mla").startswith('LeCun, Yann, et al. "Deep learning." *Nature*, vol. 521, no. 7553, 2015, pp. 436–444.')
    assert format_reference(BOOK, "chicago") == "Russell, Stuart and Peter Norvig. 2021. *Artificial Intelligence: A Modern Approach*. Hoboken, NJ: Pearson."
    assert format_reference(SOURCE, "harvard").startswith("LeCun, Y., Bengio, Y. and Hinton, G. (2015) 'Deep learning', *Nature*, 521(7553), pp. 436–444.")


def test_bibtex_ris_import():
    bib = r"""@article{lecun2015, author = {LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey},
      title = {Deep {L}earning}, journal = {Nature}, year = 2015, volume = {521}, pages = {436--444}, doi = {10.1038/nature14539}}
    @book{rn, author = "Stuart Russell and Peter Norvig", title = "AI: A Modern Approach", publisher = {Pearson}, year = {2021}}"""
    e = parse_bibtex(bib)
    assert len(e) == 2 and e[0]["title"] == "Deep Learning" and e[0]["authors"][2] == {"family": "Hinton", "given": "Geoffrey"}
    assert e[0]["data"]["pages"] == "436–444" and e[1]["source_type"] == "book" and e[1]["authors"][0]["family"] == "Russell"
    ris = "TY  - JOUR\nAU  - LeCun, Yann\nTI  - Deep learning\nJO  - Nature\nPY  - 2015\nSP  - 436\nEP  - 444\nDO  - 10.1038/nature14539\nER  - \n"
    r = parse_ris(ris)
    assert r[0]["data"]["pages"] == "436–444" and r[0]["doi"] == "10.1038/nature14539"


def test_validators():
    assert validate_doi("10.1038/nature14539") and validate_doi("https://doi.org/10.1000/xyz") and not validate_doi("abc")
    assert validate_isbn("978-0-13-461099-3") and validate_isbn("0-306-40615-2") and not validate_isbn("978-0-13-461099-4")


def test_references_api(client, user):
    h = user["headers"]
    assert client.post("/references", json={**SOURCE, "doi": "bad"}, headers=h).status_code == 422
    s = client.post("/references", json=SOURCE, headers=h).json()
    imported = client.post("/references/import", json={"format": "ris", "text": "TY  - BOOK\nTI  - كتاب عربي\nAU  - علي, محمد\nPY  - 2020\nER  - \n"}, headers=h)
    assert imported.status_code == 201 and imported.json()[0]["title"] == "كتاب عربي"
    f = client.post("/references/format", json={"source_ids": [s["id"], imported.json()[0]["id"]], "style": "apa"}, headers=h).json()
    assert [e["text"][:5] for e in f["entries"]] == ["LeCun", "علي, "]  # alphabetical
    assert len(client.get("/references?q=Deep", headers=h).json()) == 1
    assert client.delete(f"/references/{s['id']}", headers=h).status_code == 204
