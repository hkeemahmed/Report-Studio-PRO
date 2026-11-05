import { Extension, mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Table from "@tiptap/extension-table";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    reportBlocks: {
      setPageBreak: () => ReturnType;
      insertCitation: (attrs: { sourceId: string; locator?: string; label?: string }) => ReturnType;
      insertFootnote: (text: string) => ReturnType;
      insertEquation: (latex: string, inline?: boolean) => ReturnType;
      insertChart: (attrs: Record<string, any>) => ReturnType;
      insertBlock: (type: string, attrs?: Record<string, any>) => ReturnType;
    };
  }
}

const atom = (name: string, group: "block" | "inline", attrs: Record<string, any>, tag = "div") =>
  Node.create({
    name, group, atom: true, selectable: true, draggable: group === "block", inline: group === "inline",
    addAttributes() {
      const out: Record<string, any> = {};
      for (const [k, d] of Object.entries(attrs)) {
        out[k] = {
          default: d,
          parseHTML: (el: HTMLElement) => { const v = el.getAttribute(`data-${k}`); try { return v == null ? d : JSON.parse(v); } catch { return v; } },
          renderHTML: (a: any) => (a[k] == null ? {} : { [`data-${k}`]: typeof a[k] === "string" ? a[k] : JSON.stringify(a[k]) }),
        };
      }
      return out;
    },
    parseHTML() { return [{ tag: `${tag}[data-type="${name}"]` }]; },
    renderHTML({ HTMLAttributes }) { return [tag, mergeAttributes(HTMLAttributes, { "data-type": name, class: `rsp-${name}` })]; },
  });

export const PageBreak = atom("pageBreak", "block", {});
export const CoverPage = atom("coverPage", "block",
  { title: "", author: "", university: "", college: "", department: "", stage: "", supervisor: "", date: "" });
export const TableOfContents = atom("tableOfContents", "block", {});
export const Bibliography = atom("bibliography", "block", {});
export const FigureList = atom("figureList", "block", {});
export const TableList = atom("tableList", "block", {});
export const Equation = atom("equation", "block", { latex: "" });
export const InlineEquation = atom("inlineEquation", "inline", { latex: "" }, "span");
export const Chart = atom("chart", "block", { spec: null, image: "", caption: "", width: "80%" });
export const Citation = atom("citation", "inline", { sourceId: "", locator: "", label: "" }, "span");
export const Footnote = atom("footnote", "inline", { text: "" }, "span");

export const ReportCommands = Extension.create({
  name: "reportCommands",
  addCommands() {
    return {
      setPageBreak: () => ({ chain }) => chain().insertContent({ type: "pageBreak" }).createParagraphNear().run(),
      insertCitation: (attrs) => ({ commands }) => commands.insertContent({ type: "citation", attrs }),
      insertFootnote: (text) => ({ commands }) => commands.insertContent({ type: "footnote", attrs: { text } }),
      insertEquation: (latex, inline) => ({ commands }) =>
        commands.insertContent({ type: inline ? "inlineEquation" : "equation", attrs: { latex } }),
      insertChart: (attrs) => ({ commands }) => commands.insertContent({ type: "chart", attrs }),
      insertBlock: (type, attrs) => ({ commands }) => commands.insertContent({ type, attrs }),
    };
  },
});

/** Image with caption, width (% or px) and alignment; exported to DOCX/PDF with auto-numbered "Figure N". */
export const ReportImage = Image.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: "", parseHTML: (el) => el.getAttribute("data-caption") || "", renderHTML: (a) => ({ "data-caption": a.caption }) },
      width: { default: "60%", parseHTML: (el) => el.style.width || el.getAttribute("width"), renderHTML: (a) => ({ style: `width:${a.width}` }) },
      align: { default: "center", parseHTML: (el) => el.getAttribute("data-align") || "center", renderHTML: (a) => ({ "data-align": a.align }) },
    };
  },
}).configure({ allowBase64: true, inline: false });

/** Table with caption and border style. */
export const ReportTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: { default: "", parseHTML: (el) => el.getAttribute("data-caption") || "", renderHTML: (a) => ({ "data-caption": a.caption }) },
      borders: { default: "all", parseHTML: (el) => el.getAttribute("data-borders") || "all", renderHTML: (a) => ({ "data-borders": a.borders }) },
    };
  },
}).configure({ resizable: true });
