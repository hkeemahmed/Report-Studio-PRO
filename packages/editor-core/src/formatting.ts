import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: { setFontSize: (size: string) => ReturnType; unsetFontSize: () => ReturnType };
    blockFormat: {
      setLineHeight: (v: string) => ReturnType;
      setSpacingAfter: (pt: number) => ReturnType;
      setDirection: (dir: "rtl" | "ltr" | null) => ReturnType;
    };
  }
}

/** Font size as a textStyle attribute (exported to DOCX/PDF). */
export const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (a) => (a.fontSize ? { style: `font-size:${a.fontSize}` } : {}),
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size) => ({ chain }) => chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const BLOCKS = ["paragraph", "heading"];

/** Paragraph-level formatting: line height, spacing after, explicit text direction (RTL/LTR). */
export const BlockFormat = Extension.create({
  name: "blockFormat",
  addGlobalAttributes() {
    return [{
      types: BLOCKS,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
          renderHTML: (a) => (a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {}),
        },
        spacingAfter: {
          default: null,
          parseHTML: (el) => { const v = parseFloat((el as HTMLElement).style.marginBottom); return isNaN(v) ? null : v; },
          renderHTML: (a) => (a.spacingAfter != null ? { style: `margin-bottom:${a.spacingAfter}pt` } : {}),
        },
        dir: {
          default: null,
          parseHTML: (el) => el.getAttribute("dir"),
          renderHTML: (a) => ({ dir: a.dir || "auto" }),
        },
      },
    }];
  },
  addCommands() {
    const setAttr = (key: string, value: any) => ({ tr, state, dispatch }: any) => {
      const { from, to } = state.selection;
      state.doc.nodesBetween(from, to, (node: any, pos: number) => {
        if (BLOCKS.includes(node.type.name)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: value });
      });
      if (dispatch) dispatch(tr);
      return true;
    };
    return {
      setLineHeight: (v) => setAttr("lineHeight", v),
      setSpacingAfter: (pt) => setAttr("spacingAfter", pt),
      setDirection: (dir) => setAttr("dir", dir),
    };
  },
});
