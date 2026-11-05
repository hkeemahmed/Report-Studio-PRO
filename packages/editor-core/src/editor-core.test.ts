import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { computePages, formatPageNumber } from "./pagination";
import { parseCSV, renderChartSVG } from "./chart";
import { createExtensions } from "./index";

const services = { lang: "ar" as const, formatCitations: () => ({ inText: {}, entries: [] }) };
const mk = (content: any) => new Editor({ extensions: createExtensions({ services, paginate: false }), content });

describe("page layout engine", () => {
  it("breaks pages when content overflows", () => {
    const r = computePages([{ height: 400, forceBreakBefore: false }, { height: 400, forceBreakBefore: false }, { height: 300, forceBreakBefore: false }], 900);
    expect(r.pages).toBe(2);
    expect(r.breaks).toEqual([{ blockIndex: 2, fill: 100 }]);
    expect(r.lastFill).toBe(600);
  });
  it("honours explicit page breaks", () => {
    const r = computePages([{ height: 100, forceBreakBefore: false }, { height: 0, forceBreakBefore: false }, { height: 100, forceBreakBefore: true }], 900);
    expect(r.pages).toBe(2);
    expect(r.breaks[0]).toEqual({ blockIndex: 2, fill: 800 });
  });
  it("formats page numbers", () => {
    expect(formatPageNumber(12, "arabic-indic")).toBe("١٢");
    expect(formatPageNumber(14, "roman")).toBe("xiv");
  });
});

describe("charts", () => {
  it("renders all chart types as SVG", () => {
    for (const type of ["bar", "line", "pie", "scatter"] as const) {
      const svg = renderChartSVG({ type, title: "نتائج", labels: ["1", "2", "3"], series: [{ name: "s", data: [3, 5, 2] }] });
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain("نتائج");
    }
  });
  it("parses CSV into a spec", () => {
    const s = parseCSV("label,2023,2024\nA,1,2\nB,3,4")!;
    expect(s.labels).toEqual(["A", "B"]);
    expect(s.series[1]).toEqual({ name: "2024", data: [2, 4] });
  });
});

describe("editor schema", () => {
  const doc = { type: "doc", content: [
    { type: "coverPage", attrs: { title: "تقرير", author: "أحمد", university: "", college: "", department: "", stage: "", supervisor: "", date: "" } },
    { type: "heading", attrs: { level: 1, textAlign: null, lineHeight: null, spacingAfter: null, dir: "rtl" }, content: [{ type: "text", text: "المقدمة" }] },
    { type: "paragraph", attrs: { textAlign: "justify", lineHeight: "1.5", spacingAfter: null, dir: null }, content: [
      { type: "text", text: "نص " }, { type: "text", marks: [{ type: "bold" }], text: "عريض" },
      { type: "citation", attrs: { sourceId: "s1", locator: "", label: "" } }, { type: "footnote", attrs: { text: "حاشية" } }] },
    { type: "pageBreak" },
    { type: "equation", attrs: { latex: "E=mc^2" } },
    { type: "bibliography" },
  ] };
  it("round-trips report nodes without loss", () => {
    const e = mk(doc);
    const out = e.getJSON();
    expect(out.content!.map((n) => n.type)).toEqual(["coverPage", "heading", "paragraph", "pageBreak", "equation", "bibliography"]);
    expect(out.content![2].content![2]).toEqual({ type: "citation", attrs: { sourceId: "s1", locator: "", label: "" } });
    expect(out.content![2].attrs!.textAlign).toBe("justify");
    expect(out.content![1].attrs!.dir).toBe("rtl");
    e.destroy();
  });
  it("find and replace all", () => {
    const e = mk({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "قط قط كلب قط" }] }] });
    e.commands.setSearchTerm("قط");
    e.commands.replaceAll("أسد");
    expect(e.getText()).toBe("أسد أسد كلب أسد");
    e.destroy();
  });
  it("tables with merged cells and caption", () => {
    const e = mk({ type: "doc", content: [{ type: "paragraph" }] });
    e.chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).updateAttributes("table", { caption: "جدول" }).run();
    const t = e.getJSON().content!.find((n) => n.type === "table")!;
    expect(t.attrs!.caption).toBe("جدول");
    expect(t.content![0].content![0].type).toBe("tableHeader");
    e.destroy();
  });
  it("track changes accept/reject", () => {
    const e = mk({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "old " },
      { type: "text", text: "added", marks: [{ type: "insertion", attrs: { author: "a", date: "" } }] },
      { type: "text", text: "removed", marks: [{ type: "deletion", attrs: { author: "a", date: "" } }] }] }] });
    const json = e.getJSON();
    e.commands.acceptAllChanges();
    expect(e.getText()).toBe("old added");
    e.commands.setContent(json);
    e.commands.rejectAllChanges();
    expect(e.getText()).toBe("old removed");
    e.destroy();
  });
  it("font size, line height and direction commands", () => {
    const e = mk({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] });
    e.chain().selectAll().setFontSize("18pt").setLineHeight("2").setDirection("ltr").run();
    const p = e.getJSON().content![0];
    expect(p.attrs!.lineHeight).toBe("2");
    expect(p.attrs!.dir).toBe("ltr");
    expect(p.content![0].marks![0]).toEqual({ type: "textStyle", attrs: expect.objectContaining({ fontSize: "18pt" }) });
    e.destroy();
  });
});
