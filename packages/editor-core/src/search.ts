import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface SearchState { term: string; caseSensitive: boolean; matches: { from: number; to: number }[]; current: number }
export const searchKey = new PluginKey<SearchState>("rspSearch");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    search: {
      setSearchTerm: (term: string, caseSensitive?: boolean) => ReturnType;
      nextMatch: () => ReturnType;
      prevMatch: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

export function findMatches(doc: PMNode, term: string, caseSensitive = false) {
  const out: { from: number; to: number }[] = [];
  if (!term) return out;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = caseSensitive ? node.text : node.text.toLowerCase();
    let i = hay.indexOf(needle);
    while (i !== -1) { out.push({ from: pos + i, to: pos + i + term.length }); i = hay.indexOf(needle, i + needle.length); }
  });
  return out;
}

export const Search = Extension.create({
  name: "search",
  addProseMirrorPlugins() {
    return [new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => ({ term: "", caseSensitive: false, matches: [], current: 0 }),
        apply(tr, prev) {
          const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
          const next = { ...prev, ...(meta || {}) };
          if (meta || tr.docChanged) next.matches = findMatches(tr.doc, next.term, next.caseSensitive);
          if (next.current >= next.matches.length) next.current = 0;
          return next;
        },
      },
      props: {
        decorations(state) {
          const s = searchKey.getState(state)!;
          return DecorationSet.create(state.doc, s.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, { class: i === s.current ? "rsp-search-current" : "rsp-search-match" })));
        },
      },
    })];
  },
  addCommands() {
    const go = (delta: number) => ({ state, tr, dispatch, view }: any) => {
      const s = searchKey.getState(state)!;
      if (!s.matches.length) return false;
      const current = (s.current + delta + s.matches.length) % s.matches.length;
      if (dispatch) {
        tr.setMeta(searchKey, { current });
        dispatch(tr);
        const dom = view.domAtPos(s.matches[current].from);
        (dom.node as HTMLElement).parentElement?.scrollIntoView?.({ block: "center" });
      }
      return true;
    };
    return {
      setSearchTerm: (term, caseSensitive = false) => ({ tr, dispatch }) => {
        if (dispatch) dispatch(tr.setMeta(searchKey, { term, caseSensitive, current: 0 }));
        return true;
      },
      nextMatch: () => go(1),
      prevMatch: () => go(-1),
      replaceCurrent: (replacement) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state)!;
        const m = s.matches[s.current];
        if (!m) return false;
        if (dispatch) dispatch(replacement ? tr.insertText(replacement, m.from, m.to) : tr.delete(m.from, m.to));
        return true;
      },
      replaceAll: (replacement) => ({ state, tr, dispatch }) => {
        const s = searchKey.getState(state)!;
        if (!s.matches.length) return false;
        [...s.matches].reverse().forEach((m) => (replacement ? tr.insertText(replacement, m.from, m.to) : tr.delete(m.from, m.to)));
        if (dispatch) dispatch(tr);
        return true;
      },
    };
  },
});
