import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import Link from "@tiptap/extension-link";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { BlockFormat, FontSize } from "./formatting";
import { PageBreak, ReportCommands, ReportImage, ReportTable } from "./nodes";
import { WithViews, type EditorServices } from "./nodeviews";
import { Search } from "./search";
import { CommentMark, Deletion, Insertion, TrackChanges } from "./review";
import { Pagination } from "./pagination";

export * from "./formatting";
export * from "./nodes";
export * from "./search";
export * from "./review";
export * from "./pagination";
export * from "./chart";
export { EditorServicesContext, type EditorServices } from "./nodeviews";

const CellBg = Extension.create({
  name: "cellBackground",
  addGlobalAttributes() {
    return [{ types: ["tableCell", "tableHeader"], attributes: {
      backgroundColor: { default: null, parseHTML: (el) => (el as HTMLElement).style.backgroundColor || null,
        renderHTML: (a) => (a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {}) } } }];
  },
});

export const ServicesStore = Extension.create<{ services: EditorServices | null }>({
  name: "reportServices",
  addOptions: () => ({ services: null }),
  addStorage() { return { services: this.options.services }; },
});

export function createExtensions(opts: { placeholder?: string; services: EditorServices; paginate?: boolean }) {
  return [
    StarterKit.configure({ history: { depth: 500 } }),
    Underline, TextStyle, Color, FontFamily, FontSize, BlockFormat, Subscript, Superscript,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
    ReportImage, ReportTable, TableRow, TableHeader, TableCell, CellBg,
    TaskList, TaskItem.configure({ nested: true }),
    PageBreak, ReportCommands,
    WithViews.TableOfContents, WithViews.Bibliography, WithViews.FigureList, WithViews.TableList, WithViews.CoverPage,
    WithViews.Equation, WithViews.InlineEquation, WithViews.Chart, WithViews.Citation, WithViews.Footnote,
    Search, Insertion, Deletion, CommentMark, TrackChanges,
    Placeholder.configure({ placeholder: opts.placeholder ?? "" }),
    CharacterCount,
    ServicesStore.configure({ services: opts.services }),
    ...(opts.paginate === false ? [] : [Pagination]),
  ];
}
