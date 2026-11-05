import { describe, expect, it } from "vitest";
import { countWords, detectDirection, markdownToNodes, normalizeLayout, pageDims } from "./index";

describe("document schema", () => {
  it("normalizes layout and page sizes", () => {
    const l = normalizeLayout({ pageSize: "Letter", orientation: "landscape" });
    expect(pageDims(l)).toEqual({ w: 279.4, h: 215.9 });
    expect(l.margins_mm.top).toBe(25);
  });
  it("detects direction from first strong character", () => {
    expect(detectDirection("123 مرحبا")).toBe("rtl");
    expect(detectDirection("(Hello) مرحبا")).toBe("ltr");
  });
  it("counts mixed Arabic/English words", () => { expect(countWords("الذكاء الاصطناعي AI 2024")).toBe(4); });
  it("converts AI markdown into nodes", () => {
    const n = markdownToNodes("# المقدمة\n\nنص **مهم** هنا.\n\n- أ\n- ب\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(n.map((x) => x.type)).toEqual(["heading", "paragraph", "bulletList", "table"]);
    expect(n[1].content![1]).toEqual({ type: "text", text: "مهم", marks: [{ type: "bold" }] });
    expect(n[3].content![1].content![1].type).toBe("tableCell");
  });
});
