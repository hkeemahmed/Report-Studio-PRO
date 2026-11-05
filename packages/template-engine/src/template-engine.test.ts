import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES, buildDocumentFromTemplate } from "./index";

describe("template engine", () => {
  it("ships 12 categories with bilingual sections", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(12);
    for (const t of BUILTIN_TEMPLATES) expect(t.structure.every((s) => s.ar && s.en)).toBe(true);
  });
  it("builds cover, TOC, sections and bibliography (flags stored in layout by the server)", () => {
    const tpl = { ...BUILTIN_TEMPLATES[0], includeToc: undefined, includeBibliography: undefined, layout: { ...BUILTIN_TEMPLATES[0].layout, includeToc: true, includeBibliography: true } };
    const d = buildDocumentFromTemplate(tpl as any, { title: "T", language: "ar", author: "A" });
    const types = d.content!.map((n) => n.type);
    expect(types.slice(0, 3)).toEqual(["coverPage", "tableOfContents", "pageBreak"]);
    expect(types.slice(-2)).toEqual(["pageBreak", "bibliography"]);
    expect(d.content![0].attrs!.author).toBe("A");
    expect(d.content![3].content![0].text).toBe(tpl.structure[0].ar);
  });
  it("respects disabled TOC and English language", () => {
    const tpl = { ...BUILTIN_TEMPLATES[8], layout: { ...BUILTIN_TEMPLATES[8].layout, includeToc: false } };
    const d = buildDocumentFromTemplate({ ...tpl, includeToc: undefined } as any, { title: "T", language: "en" });
    expect(d.content!.map((n) => n.type)).not.toContain("tableOfContents");
    expect(d.content![1].content![0].text).toBe(tpl.structure[0].en);
  });
});
