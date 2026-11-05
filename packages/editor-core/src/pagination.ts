/**
 * Page Layout Engine — a separate layer from document content.
 *
 * The document is a single ProseMirror flow. This engine measures each top-level block, computes where pages
 * break (respecting explicit page breaks), and renders page furniture (margins, header, footer, page number,
 * gap between sheets) as widget decorations — content is never modified by pagination.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";

export interface BlockBox { height: number; forceBreakBefore: boolean }
export interface PageBreakAt { blockIndex: number; fill: number }
export interface PaginationResult { breaks: PageBreakAt[]; pages: number; lastFill: number }

/** Pure function: assign blocks to pages. `fill` = unused space at the bottom of the page ending before blockIndex. */
export function computePages(blocks: BlockBox[], contentHeight: number): PaginationResult {
  const breaks: PageBreakAt[] = [];
  let used = 0;
  blocks.forEach((b, i) => {
    const needBreak = b.forceBreakBefore ? i > 0 : used > 0 && used + b.height > contentHeight;
    if (needBreak) {
      breaks.push({ blockIndex: i, fill: Math.max(0, contentHeight - used) });
      used = 0;
    }
    used += b.height;
    // A single block taller than a page (very long table/paragraph) overflows its page in the editor view;
    // the PDF/DOCX engines split it properly. Start counting the overflow towards the next page.
    while (used > contentHeight && b.height > contentHeight) used -= contentHeight;
  });
  return { breaks, pages: breaks.length + 1, lastFill: Math.max(0, contentHeight - used) };
}

export interface PageFurniture {
  pageHeightPx: number; marginTopPx: number; marginBottomPx: number; gapPx: number;
  header: string; footer: string; headerAlign: string; footerAlign: string;
  pageNumbers: { enabled: boolean; position: "header" | "footer"; align: string; format: string; start: number };
  skipFirst: boolean; enabled: boolean;
}

export const paginationKey = new PluginKey<{ furniture: PageFurniture | null; result: PaginationResult | null }>("rspPagination");

export function formatPageNumber(n: number, format: string): string {
  if (format === "arabic-indic") return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
  if (format === "roman") {
    const v: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = ""; for (const [k, r] of v) while (n >= k) { s += r; n -= k; } return s;
  }
  return String(n);
}

function band(text: string, align: string, cls: string) {
  const el = document.createElement("div");
  el.className = `rsp-page-band ${cls}`;
  el.style.textAlign = align;
  el.textContent = text;
  return el;
}

function pageNo(f: PageFurniture, pageIndex: number) {
  const shown = pageIndex + f.pageNumbers.start - (f.skipFirst ? 1 : 0);
  return f.pageNumbers.enabled && !(f.skipFirst && pageIndex === 0) ? formatPageNumber(shown, f.pageNumbers.format) : "";
}

/** Footer of page `pageIndex` + gap + header of next page. */
export function makeSpacer(f: PageFurniture, pageIndex: number, fill: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "rsp-page-spacer";
  wrap.contentEditable = "false";
  wrap.setAttribute("data-page-end", String(pageIndex + 1));
  const bottom = document.createElement("div");
  bottom.style.height = `${fill + f.marginBottomPx}px`;
  bottom.className = "rsp-page-bottom";
  bottom.appendChild(footerEl(f, pageIndex));
  const gap = document.createElement("div");
  gap.className = "rsp-page-gap";
  gap.style.height = `${f.gapPx}px`;
  const top = document.createElement("div");
  top.className = "rsp-page-top";
  top.style.height = `${f.marginTopPx}px`;
  top.appendChild(headerEl(f, pageIndex + 1));
  wrap.append(bottom, gap, top);
  return wrap;
}

export function headerEl(f: PageFurniture, pageIndex: number) {
  const skip = f.skipFirst && pageIndex === 0;
  const parts = [skip ? "" : f.header];
  const n = f.pageNumbers.position === "header" ? pageNo(f, pageIndex) : "";
  const el = band(parts.join(""), f.headerAlign, "rsp-header");
  if (n) el.appendChild(band(n, f.pageNumbers.align, "rsp-pagenum"));
  return el;
}

export function footerEl(f: PageFurniture, pageIndex: number) {
  const skip = f.skipFirst && pageIndex === 0;
  const el = band(skip ? "" : f.footer, f.footerAlign, "rsp-footer");
  const n = f.pageNumbers.position === "footer" ? pageNo(f, pageIndex) : "";
  if (n) el.appendChild(band(n, f.pageNumbers.align, "rsp-pagenum"));
  return el;
}

function buildDecorations(view: EditorView | null, doc: any, st: { furniture: PageFurniture | null; result: PaginationResult | null }) {
  const f = st.furniture, r = st.result;
  if (!f || !f.enabled || !r) return DecorationSet.empty;
  const decos: Decoration[] = [];
  const positions: number[] = [];
  doc.forEach((_n: any, offset: number) => positions.push(offset));
  r.breaks.forEach((b, i) => {
    const pos = positions[b.blockIndex];
    if (pos == null) return;
    decos.push(Decoration.widget(pos, () => makeSpacer(f, i, b.fill), { side: -1, key: `pb-${i}-${Math.round(b.fill)}`, ignoreSelection: true }));
  });
  decos.push(Decoration.widget(0, () => { const t = document.createElement("div"); t.className = "rsp-page-top rsp-first-top"; t.style.height = `${f.marginTopPx}px`; t.contentEditable = "false"; t.appendChild(headerEl(f, 0)); return t; }, { side: -1, key: "first-top" }));
  decos.push(Decoration.widget(doc.content.size, () => {
    const b = document.createElement("div"); b.className = "rsp-page-bottom rsp-last-bottom"; b.contentEditable = "false";
    b.style.height = `${r.lastFill + f.marginBottomPx}px`; b.appendChild(footerEl(f, r.pages - 1)); return b;
  }, { side: 1, key: `last-${r.pages}-${Math.round(r.lastFill)}` }));
  return DecorationSet.create(doc, decos);
}

export const Pagination = Extension.create({
  name: "pagination",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: paginationKey,
      state: {
        init: () => ({ furniture: null, result: null }),
        apply: (tr, prev) => tr.getMeta(paginationKey) ? { ...prev, ...tr.getMeta(paginationKey) } : prev,
      },
      props: {
        decorations(state) { return buildDecorations(null, state.doc, paginationKey.getState(state)!); },
      },
      view: (view) => {
        let raf = 0;
        const measure = () => {
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            const st = paginationKey.getState(view.state);
            const f = st?.furniture;
            if (!f || !f.enabled) return;
            const contentHeight = f.pageHeightPx - f.marginTopPx - f.marginBottomPx;
            const blocks: BlockBox[] = [];
            const children = Array.from(view.dom.children) as HTMLElement[];
            let prevBreak = false;
            for (const el of children) {
              if (el.classList.contains("rsp-page-spacer") || el.classList.contains("rsp-page-top") ||
                  el.classList.contains("rsp-page-bottom") || el.classList.contains("ProseMirror-widget") ||
                  el.classList.contains("ProseMirror-gapcursor") || el.classList.contains("ProseMirror-trailingBreak")) continue;
              const cs = getComputedStyle(el);
              const h = el.getBoundingClientRect().height / (parseFloat((view.dom as HTMLElement).dataset.zoom || "1")) +
                parseFloat(cs.marginTop || "0") + parseFloat(cs.marginBottom || "0");
              const isBreak = el.getAttribute("data-type") === "pageBreak";
              blocks.push({ height: isBreak ? 0 : h, forceBreakBefore: prevBreak });
              // explicit page breaks and the cover page end the current page (same rule as the PDF/DOCX engines)
              prevBreak = isBreak || el.classList.contains("node-coverPage");
            }
            const result = computePages(blocks, contentHeight);
            const old = st!.result;
            const same = old && old.pages === result.pages && Math.abs(old.lastFill - result.lastFill) < 1 &&
              old.breaks.length === result.breaks.length &&
              old.breaks.every((b, i) => b.blockIndex === result.breaks[i].blockIndex && Math.abs(b.fill - result.breaks[i].fill) < 1);
            if (!same) {
              view.dispatch(view.state.tr.setMeta(paginationKey, { result }).setMeta("addToHistory", false));
              (view.dom as HTMLElement).dispatchEvent(new CustomEvent("rsp-pages", { detail: result.pages }));
            }
          });
        };
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(view.dom);
        measure();
        return { update: measure, destroy: () => { cancelAnimationFrame(raf); ro?.disconnect(); } };
      },
    })];
  },
});
