import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    trackChanges: {
      setTrackChanges: (enabled: boolean, author?: string) => ReturnType;
      acceptAllChanges: () => ReturnType;
      rejectAllChanges: () => ReturnType;
    };
    comment: { setComment: (id: string) => ReturnType; unsetComment: (id: string) => ReturnType };
  }
}

const attrs = { author: { default: "" }, date: { default: "" } };

export const Insertion = Mark.create({
  name: "insertion", inclusive: true, excludes: "deletion",
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: "ins" }],
  renderHTML: ({ HTMLAttributes }) => ["ins", mergeAttributes(HTMLAttributes, { class: "rsp-ins" }), 0],
});

export const Deletion = Mark.create({
  name: "deletion", inclusive: false, excludes: "insertion",
  addAttributes: () => attrs,
  parseHTML: () => [{ tag: "del" }],
  renderHTML: ({ HTMLAttributes }) => ["del", mergeAttributes(HTMLAttributes, { class: "rsp-del" }), 0],
});

export const CommentMark = Mark.create({
  name: "comment", inclusive: false,
  addAttributes: () => ({ commentId: { default: "", parseHTML: (el) => el.getAttribute("data-comment-id"), renderHTML: (a) => ({ "data-comment-id": a.commentId }) } }),
  parseHTML: () => [{ tag: "span[data-comment-id]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "rsp-comment" }), 0],
  addCommands() {
    return {
      setComment: (id) => ({ commands }) => commands.setMark(this.name, { commentId: id }),
      unsetComment: (id) => ({ tr, state, dispatch }) => {
        state.doc.descendants((node, pos) => {
          node.marks.forEach((m) => { if (m.type.name === "comment" && m.attrs.commentId === id) tr.removeMark(pos, pos + node.nodeSize, m); });
        });
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});

export const trackKey = new PluginKey<{ enabled: boolean; author: string }>("rspTrack");

/** Suggestion mode: typed text gets an insertion mark, deletions become deletion marks (text kept until accepted). */
export const TrackChanges = Extension.create({
  name: "trackChanges",
  addProseMirrorPlugins() {
    const ext = this;
    return [new Plugin({
      key: trackKey,
      state: {
        init: () => ({ enabled: false, author: "" }),
        apply: (tr, prev) => tr.getMeta(trackKey) ?? prev,
      },
      props: {
        handleTextInput(view, from, to, text) {
          const st = trackKey.getState(view.state)!;
          if (!st.enabled) return false;
          const { schema } = view.state;
          const mark = schema.marks.insertion.create({ author: st.author, date: new Date().toISOString() });
          let tr = view.state.tr;
          if (from !== to) tr = tr.addMark(from, to, schema.marks.deletion.create({ author: st.author, date: new Date().toISOString() }));
          tr = tr.insert(to, schema.text(text, [mark]));
          tr.setSelection((view.state.selection.constructor as any).near(tr.doc.resolve(to + text.length)));
          view.dispatch(tr);
          return true;
        },
        handleKeyDown(view, event) {
          const st = trackKey.getState(view.state)!;
          if (!st.enabled || (event.key !== "Backspace" && event.key !== "Delete")) return false;
          const { state } = view;
          let { from, to } = state.selection;
          if (from === to) {
            if (event.key === "Backspace") from = Math.max(1, from - 1); else to = Math.min(state.doc.content.size - 1, to + 1);
          }
          if (from >= to) return false;
          // own insertions are really deleted; other text gets a deletion mark
          const tr = state.tr;
          const own: [number, number][] = [];
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.isText && node.marks.some((m) => m.type.name === "insertion")) own.push([Math.max(pos, from), Math.min(pos + node.nodeSize, to)]);
          });
          tr.addMark(from, to, state.schema.marks.deletion.create({ author: st.author, date: new Date().toISOString() }));
          own.reverse().forEach(([a, b]) => tr.delete(a, b));
          const pos = event.key === "Backspace" ? from : to;
          tr.setSelection((state.selection.constructor as any).near(tr.doc.resolve(Math.min(tr.mapping.map(pos), tr.doc.content.size))));
          view.dispatch(tr);
          ext.editor?.emit("update", { editor: ext.editor, transaction: tr });
          return true;
        },
      },
    })];
  },
  addCommands() {
    const resolve = (accept: boolean) => ({ state, tr, dispatch }: any) => {
      const remove: [number, number][] = [];
      state.doc.descendants((node: any, pos: number) => {
        if (!node.isText) return;
        const ins = node.marks.find((m: any) => m.type.name === "insertion");
        const del = node.marks.find((m: any) => m.type.name === "deletion");
        if ((accept && del) || (!accept && ins)) remove.push([pos, pos + node.nodeSize]);
      });
      tr.removeMark(0, state.doc.content.size, state.schema.marks.insertion);
      tr.removeMark(0, state.doc.content.size, state.schema.marks.deletion);
      remove.reverse().forEach(([a, b]) => tr.delete(a, b));
      if (dispatch) dispatch(tr);
      return true;
    };
    return {
      setTrackChanges: (enabled, author = "") => ({ tr, dispatch }) => { if (dispatch) dispatch(tr.setMeta(trackKey, { enabled, author })); return true; },
      acceptAllChanges: () => resolve(true),
      rejectAllChanges: () => resolve(false),
    };
  },
});
