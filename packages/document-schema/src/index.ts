import type { DocNode, PageLayout } from "@rsp/shared-types";

export const PAGE_SIZES_MM: Record<string, [number, number]> = {
  A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6],
};

export const DEFAULT_LAYOUT: PageLayout = {
  pageSize: "A4", width_mm: 210, height_mm: 297, orientation: "portrait",
  margins_mm: { top: 25, bottom: 25, left: 25, right: 25 }, columns: 1, pageBorder: false,
  header: { text: "", align: "center" }, footer: { text: "", align: "center" },
  pageNumbers: { enabled: true, position: "footer", align: "center", format: "arabic", start: 1 },
  direction: "rtl", fontFamily: "Amiri", fontSize: 14, lineHeight: 1.5, headingColor: "#1e3a8a", differentFirstPage: true,
};

/** Merge partial layout with defaults (mirrors backend normalize_layout). */
export function normalizeLayout(l?: Partial<PageLayout> | null): PageLayout {
  const out: PageLayout = {
    ...DEFAULT_LAYOUT, ...(l || {}),
    margins_mm: { ...DEFAULT_LAYOUT.margins_mm, ...(l?.margins_mm || {}) },
    header: { ...DEFAULT_LAYOUT.header, ...(l?.header || {}) },
    footer: { ...DEFAULT_LAYOUT.footer, ...(l?.footer || {}) },
    pageNumbers: { ...DEFAULT_LAYOUT.pageNumbers, ...(l?.pageNumbers || {}) },
  } as PageLayout;
  if (out.pageSize in PAGE_SIZES_MM) [out.width_mm, out.height_mm] = PAGE_SIZES_MM[out.pageSize];
  return out;
}

export function pageDims(l: PageLayout): { w: number; h: number } {
  const a = Math.min(l.width_mm, l.height_mm), b = Math.max(l.width_mm, l.height_mm);
  return l.orientation === "landscape" ? { w: b, h: a } : { w: a, h: b };
}

export const MM_TO_PX = 96 / 25.4;

export function nodeText(n: DocNode): string {
  if (n.type === "text") return n.text || "";
  if (n.type === "hardBreak") return "\n";
  return (n.content || []).map(nodeText).join("");
}

export function plainText(doc: DocNode): string {
  const lines: string[] = [];
  const walk = (n: DocNode) => {
    if (["paragraph", "heading", "codeBlock"].includes(n.type)) lines.push(nodeText(n));
    else (n.content || []).forEach(walk);
  };
  walk(doc);
  return lines.join("\n").trim();
}

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) || []).length;
}

/** Unicode first-strong-character direction detection. */
export function detectDirection(text: string): "rtl" | "ltr" | "" {
  for (const ch of text) {
    if (/[֐-ࣿיִ-﷿ﹰ-﻿]/.test(ch)) return "rtl";
    if (/\p{L}/u.test(ch)) return "ltr";
  }
  return "";
}

export function headings(doc: DocNode): { level: number; text: string; index: number }[] {
  return (doc.content || []).flatMap((n, index) =>
    n.type === "heading" ? [{ level: n.attrs?.level ?? 1, text: nodeText(n), index }] : []);
}

/** Convert simple Markdown returned by AI into Tiptap nodes (headings, lists, tables, paragraphs, bold/italic). */
export function markdownToNodes(md: string): DocNode[] {
  const out: DocNode[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  const inline = (s: string): DocNode[] => {
    const nodes: DocNode[] = [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (m.index > last) nodes.push({ type: "text", text: s.slice(last, m.index) });
      const t = m[0];
      if (t.startsWith("**")) nodes.push({ type: "text", text: t.slice(2, -2), marks: [{ type: "bold" }] });
      else if (t.startsWith("`")) nodes.push({ type: "text", text: t.slice(1, -1), marks: [{ type: "code" }] });
      else nodes.push({ type: "text", text: t.slice(1, -1), marks: [{ type: "italic" }] });
      last = m.index + t.length;
    }
    if (last < s.length) nodes.push({ type: "text", text: s.slice(last) });
    return nodes.filter((n) => n.text);
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { out.push({ type: "heading", attrs: { level: h[1].length }, content: inline(h[2].trim()) }); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items: DocNode[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push({ type: "listItem", content: [{ type: "paragraph", content: inline(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "")) }] });
        i++;
      }
      out.push({ type: ordered ? "orderedList" : "bulletList", content: items });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      out.push({ type: "table", content: rows.map((r, ri) => ({ type: "tableRow", content: r.map((c) => ({
        type: ri === 0 ? "tableHeader" : "tableCell", content: [{ type: "paragraph", content: inline(c) }] })) })) });
      continue;
    }
    if (line.trim()) {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*([-*•]|\d+[.)])\s|\s*\|)/.test(lines[i])) para.push(lines[i++]);
      out.push({ type: "paragraph", content: inline(para.join(" ")) });
      continue;
    }
    i++;
  }
  return out;
}
