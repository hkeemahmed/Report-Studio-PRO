import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import katex from "katex";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";
import { renderChartSVG, type ChartSpec } from "./chart";
import { Bibliography, Chart, Citation, CoverPage, Equation, FigureList, Footnote, InlineEquation, TableList, TableOfContents } from "./nodes";

export interface EditorServices {
  /** Formatted bibliography entries for sources cited in the document (in-text label + full reference). */
  formatCitations: (sourceIds: string[]) => { inText: Record<string, string>; entries: string[] };
  lang: "ar" | "en";
  onEdit?: (kind: string, pos: number, attrs: Record<string, any>) => void;
}

const L = {
  ar: { toc: "جدول المحتويات", refs: "المراجع", figs: "قائمة الأشكال", tabs: "قائمة الجداول", fig: "شكل", tab: "جدول",
        noRefs: "لا توجد استشهادات بعد. أدرج استشهاداً من تبويب المراجع.", by: "إعداد", sup: "إشراف", stage: "المرحلة", date: "التاريخ",
        page: "فاصل صفحة", empty: "لا يوجد عناصر", edit: "انقر مرتين للتعديل" },
  en: { toc: "Table of Contents", refs: "References", figs: "List of Figures", tabs: "List of Tables", fig: "Figure", tab: "Table",
        noRefs: "No citations yet. Insert one from the References tab.", by: "Prepared by", sup: "Supervisor", stage: "Stage", date: "Date",
        page: "Page break", empty: "No items", edit: "Double-click to edit" },
};

/** Provided by the host app around <EditorContent/>; node views re-render when it changes. */
export const EditorServicesContext = createContext<EditorServices | null>(null);
const fallback: EditorServices = { formatCitations: () => ({ inText: {}, entries: [] }), lang: "ar" };
let currentServices: EditorServices = fallback;
const svc = (_editor: Editor): EditorServices => currentServices;

/** Re-render a node view whenever the document changes (for views derived from other nodes). */
function useLive(editor: Editor) {
  const ctx = useContext(EditorServicesContext);
  if (ctx) currentServices = ctx;
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    editor.on("update", f);
    return () => { editor.off("update", f); };
  }, [editor]);
  return ctx ?? currentServices;
}

function collect(editor: Editor, type: string) {
  const out: any[] = [];
  editor.state.doc.descendants((n) => { if (n.type.name === type) out.push(n); });
  return out;
}

function Toc({ editor }: NodeViewProps) {
  useLive(editor);
  const l = L[svc(editor).lang];
  const items: { level: number; text: string; pos: number }[] = [];
  editor.state.doc.forEach((n, pos) => { if (n.type.name === "heading" && n.textContent.trim()) items.push({ level: n.attrs.level, text: n.textContent, pos }); });
  return (
    <NodeViewWrapper className="rsp-block rsp-toc" contentEditable={false}>
      <h2>{l.toc}</h2>
      {items.length === 0 && <p className="rsp-muted">{l.empty}</p>}
      <ul>{items.map((i, k) => (
        <li key={k} style={{ paddingInlineStart: (i.level - 1) * 18 }}>
          <a href="#" onClick={(e) => { e.preventDefault(); editor.commands.focus(i.pos + 1); (editor.view.nodeDOM(i.pos) as HTMLElement)?.scrollIntoView({ block: "center" }); }}>{i.text}</a>
        </li>))}</ul>
    </NodeViewWrapper>
  );
}

function Bib({ editor }: NodeViewProps) {
  useLive(editor);
  const s = svc(editor);
  const ids = collect(editor, "citation").map((n) => n.attrs.sourceId).filter((v, i, a) => v && a.indexOf(v) === i);
  const { entries } = s.formatCitations(ids);
  return (
    <NodeViewWrapper className="rsp-block rsp-bib" contentEditable={false}>
      <h2>{L[s.lang].refs}</h2>
      {entries.length === 0 ? <p className="rsp-muted">{L[s.lang].noRefs}</p> :
        entries.map((e, i) => <p key={i} className="rsp-ref" dir="auto" dangerouslySetInnerHTML={{ __html: e.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)).replace(/\*([^*]+)\*/g, "<em>$1</em>") }} />)}
    </NodeViewWrapper>
  );
}

function ListOf({ editor, node }: NodeViewProps) {
  useLive(editor);
  const l = L[svc(editor).lang];
  const isFig = node.type.name === "figureList";
  const caps = isFig ? [...collect(editor, "image"), ...collect(editor, "chart")].map((n) => n.attrs.caption).filter(Boolean)
    : collect(editor, "table").map((n) => n.attrs.caption).filter(Boolean);
  return (
    <NodeViewWrapper className="rsp-block rsp-listof" contentEditable={false}>
      <h2>{isFig ? l.figs : l.tabs}</h2>
      {caps.length === 0 && <p className="rsp-muted">{l.empty}</p>}
      <ol>{caps.map((c: string, i: number) => <li key={i}>{(isFig ? l.fig : l.tab) + " " + (i + 1) + ": " + c}</li>)}</ol>
    </NodeViewWrapper>
  );
}

function Cover({ node, editor, getPos }: NodeViewProps) {
  useLive(editor);
  const a = node.attrs, l = L[svc(editor).lang];
  return (
    <NodeViewWrapper className="rsp-block rsp-cover" contentEditable={false} title={l.edit}
      onDoubleClick={() => svc(editor).onEdit?.("coverPage", getPos() as number, a)}>
      <div className="rsp-cover-org">{[a.university, a.college, a.department].filter(Boolean).map((t: string, i: number) => <div key={i}>{t}</div>)}</div>
      <h1 className="rsp-cover-title">{a.title}</h1>
      <div className="rsp-cover-meta">
        {a.author && <div>{l.by}: {a.author}</div>}
        {a.stage && <div>{l.stage}: {a.stage}</div>}
        {a.supervisor && <div>{l.sup}: {a.supervisor}</div>}
        {a.date && <div>{l.date}: {a.date}</div>}
      </div>
    </NodeViewWrapper>
  );
}

function Eq({ node, editor, getPos }: NodeViewProps) {
  const ctx = useContext(EditorServicesContext); if (ctx) currentServices = ctx;
  const inline = node.type.name === "inlineEquation";
  const html = useMemo(() => {
    try { return katex.renderToString(node.attrs.latex || "\\square", { displayMode: !inline, throwOnError: false }); }
    catch { return node.attrs.latex; }
  }, [node.attrs.latex, inline]);
  return (
    <NodeViewWrapper as={inline ? "span" : "div"} className={inline ? "rsp-ieq" : "rsp-block rsp-eq"} dir="ltr" contentEditable={false}
      onDoubleClick={() => svc(editor).onEdit?.("equation", getPos() as number, node.attrs)}>
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </NodeViewWrapper>
  );
}

function ChartView({ node, editor, getPos }: NodeViewProps) {
  useLive(editor);
  const svg = useMemo(() => (node.attrs.spec ? renderChartSVG(node.attrs.spec as ChartSpec) : ""), [node.attrs.spec]);
  const l = L[svc(editor).lang];
  return (
    <NodeViewWrapper className="rsp-block rsp-chart" contentEditable={false} title={l.edit}
      onDoubleClick={() => svc(editor).onEdit?.("chart", getPos() as number, node.attrs)}>
      <div style={{ width: node.attrs.width || "80%", margin: "0 auto" }} dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="width:100%;height:auto" ') }} />
      {node.attrs.caption && <div className="rsp-caption">{l.fig}: {node.attrs.caption}</div>}
    </NodeViewWrapper>
  );
}

function Cite({ node, editor }: NodeViewProps) {
  useLive(editor);
  const { inText } = svc(editor).formatCitations(
    collect(editor, "citation").map((n) => n.attrs.sourceId).filter((v, i, a) => v && a.indexOf(v) === i));
  return <NodeViewWrapper as="span" className="rsp-cite" contentEditable={false}>{inText[node.attrs.sourceId] || node.attrs.label || "[?]"}</NodeViewWrapper>;
}

function Note({ node, editor, getPos }: NodeViewProps) {
  useLive(editor);
  let n = 0, idx = 0;
  editor.state.doc.descendants((x, pos) => { if (x.type.name === "footnote") { n++; if (pos === getPos()) idx = n; } });
  return (
    <NodeViewWrapper as="span" className="rsp-fn" contentEditable={false} title={node.attrs.text}
      onDoubleClick={() => svc(editor).onEdit?.("footnote", getPos() as number, node.attrs)}><sup>{idx}</sup></NodeViewWrapper>
  );
}

export const WithViews = {
  TableOfContents: TableOfContents.extend({ addNodeView: () => ReactNodeViewRenderer(Toc) }),
  Bibliography: Bibliography.extend({ addNodeView: () => ReactNodeViewRenderer(Bib) }),
  FigureList: FigureList.extend({ addNodeView: () => ReactNodeViewRenderer(ListOf) }),
  TableList: TableList.extend({ addNodeView: () => ReactNodeViewRenderer(ListOf) }),
  CoverPage: CoverPage.extend({ addNodeView: () => ReactNodeViewRenderer(Cover) }),
  Equation: Equation.extend({ addNodeView: () => ReactNodeViewRenderer(Eq) }),
  InlineEquation: InlineEquation.extend({ addNodeView: () => ReactNodeViewRenderer(Eq) }),
  Chart: Chart.extend({ addNodeView: () => ReactNodeViewRenderer(ChartView) }),
  Citation: Citation.extend({ addNodeView: () => ReactNodeViewRenderer(Cite) }),
  Footnote: Footnote.extend({ addNodeView: () => ReactNodeViewRenderer(Note) }),
};
