import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BubbleMenu, useEditor } from "@tiptap/react";
import { ArrowLeft, ArrowRight, Check, CloudOff, Loader2, Sparkles, AlertTriangle, X } from "lucide-react";
import type { CitationStyle, PageLayout, ReportDocument, Source } from "@rsp/shared-types";
import { countWords, normalizeLayout, plainText } from "@rsp/document-schema";
import { createExtensions, EditorServicesContext, type EditorServices } from "@rsp/editor-core";
import { Badge, Button, Dialog, Dropdown, Input, MenuItem, Select, Spinner, cx, useToast } from "@rsp/ui-components";
import { api, ApiError, download, errorMessage, NetworkError } from "../lib/api";
import { localStore } from "../lib/offline";
import { sync } from "../lib/sync";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import Ribbon from "./Ribbon";
import Canvas, { Ruler } from "./Canvas";
import SidePanel, { type PanelTab } from "./SidePanel";
import AISidebar, { AIResultPanel, EDITOR_ACTIONS, type PendingResult } from "./AISidebar";
import { ChartDialog, CitationDialog, CoverDialog, CropDialog, EquationDialog, FindReplace, FootnoteDialog, HeaderFooterDialog, ImageDialog,
  LinkDialog, PageSetupDialog, ShapeDialog, TableDialog, type DialogKind } from "./dialogs";

/** Side-by-side pages rendered by the real layout engine (exactly what prints / exports to PDF). */
function MultiPageView({ docId, getContent, layout, zoom, onOpen, lang }: { docId: string; getContent: () => any; layout: PageLayout;
  zoom: number; onOpen: () => void; lang: string }) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    setPages(null);
    api.pageImages(docId, getContent(), layout, 0.5).then((r) => live && setPages(r.pages)).catch((e) => live && setErr(errorMessage(e)));
    return () => { live = false; };
  }, [docId, layout]);
  if (err) return <p className="p-6 text-danger">{err}</p>;
  if (!pages) return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  return (
    <div className="flex flex-wrap content-start justify-center gap-6 p-6" data-testid="multi-pages" dir={lang === "ar" ? "rtl" : "ltr"}>
      {pages.map((src, i) => (
        <button key={i} onClick={onOpen} className="flex flex-col items-center gap-1" title={lang === "ar" ? "فتح في المحرر" : "Open in editor"}>
          <img src={src} alt={`page ${i + 1}`} className="bg-white shadow-page" style={{ width: 260 * zoom }} />
          <span className="text-xs text-slate-500">{i + 1}</span>
        </button>))}
    </div>
  );
}

type SaveState = "saved" | "saving" | "unsaved" | "offline" | "conflict" | "error";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const toast = useToast();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [loadError, setLoadError] = useState("");
  const docRef = useRef<ReportDocument | null>(null);
  const [layout, setLayoutState] = useState<PageLayout>(normalizeLayout(null));
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [zoom, setZoom] = useState(() => +(localStorage.getItem("rsp.zoom") || 1));
  const [multi, setMulti] = useState(false);
  const [ruler, setRuler] = useState(true);
  const [navOpen, setNavOpen] = useState(true);
  const [panel, setPanel] = useState<PanelTab>("nav");
  const [newComment, setNewComment] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [dialog, setDialog] = useState<{ kind: DialogKind; payload?: any }>({ kind: null });
  const [track, setTrack] = useState(false);
  const [spell, setSpell] = useState(true);
  const [pages, setPages] = useState(1);
  const [sources, setSources] = useState<Source[]>([]);
  const [fmt, setFmt] = useState<{ inText: Record<string, string>; entries: string[] }>({ inText: {}, entries: [] });
  const [preview, setPreview] = useState<{ url: string } | null>(null);
  const [saveAs, setSaveAs] = useState<string | null>(null);
  const [, force] = useState(0);
  const saveTimer = useRef<number>();
  const saving = useRef<Promise<void> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const citationStyle = (layout.citationStyle || "apa") as CitationStyle;

  const services: EditorServices = useMemo(() => ({
    lang, formatCitations: () => fmt,
    onEdit: (kind, pos, attrs) => setDialog({ kind: kind === "coverPage" ? "cover" : (kind as DialogKind), payload: { pos, attrs } }),
  }), [fmt, lang]);

  const editor = useEditor({
    extensions: createExtensions({ services, placeholder: lang === "ar" ? "ابدأ الكتابة هنا…" : "Start writing here…" }),
    editorProps: { attributes: { class: "rsp-prose", "data-testid": "editor" } },
    onUpdate: () => markDirty(),
    onSelectionUpdate: () => force((x) => x + 1),
  }, []);

  /* ---------- load ---------- */
  const load = useCallback(async () => {
    if (!id) return;
    let d: ReportDocument | undefined;
    try {
      d = await api.document(id);
      const pendingLocal = await localStore.getOutbox(id);
      if (pendingLocal) d = (await localStore.getDoc(id)) ?? d;  // unsynced local edits win locally until pushed
      else await localStore.putDoc(d);
    } catch (e) {
      if (e instanceof NetworkError || (e instanceof ApiError && e.status === 404)) d = await localStore.getDoc(id);
      if (!d) { setLoadError(errorMessage(e)); return; }
      if (e instanceof NetworkError) setSaveState("offline");
    }
    docRef.current = d; setDoc(d); setTitle(d.title); setLayoutState(normalizeLayout(d.layout));
    editor?.commands.setContent(d.content as any, false);
    editor?.commands.setTrackChanges(false);
  }, [id, editor]);
  useEffect(() => { if (editor) load(); }, [editor, load]);
  useEffect(() => { api.sources().then(setSources).catch(() => {}); }, []);

  /* ---------- citations formatting (server-side styles, cached) ---------- */
  const citeKey = useRef("");
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const ids: string[] = [];
      editor.state.doc.descendants((n) => { if (n.type.name === "citation" && n.attrs.sourceId && !ids.includes(n.attrs.sourceId)) ids.push(n.attrs.sourceId); });
      const key = citationStyle + ids.join(",") + sources.length;
      if (key === citeKey.current) return;
      citeKey.current = key;
      if (!ids.length) { setFmt({ inText: {}, entries: [] }); return; }
      api.formatSources(ids, citationStyle).then((r) => {
        const numeric = ["ieee", "vancouver"].includes(citationStyle);
        const inText: Record<string, string> = {};
        r.entries.forEach((e) => (inText[e.id] = e.in_text));
        if (numeric) ids.forEach((sid, i) => (inText[sid] = citationStyle === "ieee" ? `[${i + 1}]` : `(${i + 1})`));
        setFmt({ inText, entries: r.entries.map((e) => e.text) });
      }).catch(() => {});
    };
    update();
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [editor, citationStyle, sources]);

  /* ---------- saving ---------- */
  const doSave = useCallback(async (opts: { createVersion?: boolean; label?: string } = {}) => {
    if (!editor || !docRef.current) return;
    window.clearTimeout(saveTimer.current);
    await saving.current;
    const run = (async () => {
      setSaveState("saving");
      const changes = { title: title.trim() || docRef.current!.title, content: editor.getJSON(), layout };
      try {
        const r = await sync.save(docRef.current!, changes, opts);
        if (r.status === "conflict") { setSaveState("conflict"); toast("warning", t("conflict")); return; }
        docRef.current = r.doc; setDoc(r.doc);
        setSaveState(r.status === "queued" ? "offline" : "saved");
        if (opts.createVersion && r.status === "saved") toast("success", t("saved"));
      } catch (e) { setSaveState("error"); toast("error", errorMessage(e)); }
    })();
    saving.current = run;
    await run;
  }, [editor, title, layout, toast, t]);

  const markDirty = () => {
    setSaveState((s) => (s === "conflict" ? s : "unsaved"));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => doSaveRef.current(), 2000);
  };
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;

  const setLayout = (l: PageLayout) => { setLayoutState(normalizeLayout(l)); markDirty(); };
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (saveState === "unsaved" || saveState === "saving") { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", f); return () => window.removeEventListener("beforeunload", f); }, [saveState]);
  useEffect(() => () => { window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => localStorage.setItem("rsp.zoom", String(zoom)), [zoom]);
  useEffect(() => { editor?.commands.setTrackChanges(track, user?.full_name || user?.email || ""); }, [track, editor, user]);

  /* ---------- export / print ---------- */
  const exportAs = async (f: string) => {
    if (!docRef.current || !editor) return;
    try {
      await doSave();
      const blob = await api.exportFile(f, docRef.current.id, editor.getJSON(), layout);
      download(blob, `${(title || "report").replace(/[\\/:*?"<>|]+/g, "")}.${f}`);
    } catch (e) { toast("error", errorMessage(e)); }
  };
  const print = async () => {
    if (!docRef.current || !editor) return;
    try { const blob = await api.exportFile("pdf", docRef.current.id, editor.getJSON(), layout); setPreview({ url: URL.createObjectURL(blob) }); }
    catch (e) { toast("error", errorMessage(e)); }
  };

  /* ---------- shortcuts ---------- */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") { e.preventDefault(); doSaveRef.current({ createVersion: true, label: "manual save" }); }
      else if (key === "f" || key === "h") { e.preventDefault(); setDialog({ kind: "find", payload: { replace: key === "h" } }); }
      else if (key === "p") { e.preventDefault(); print(); }
      else if (key === "k") { e.preventDefault(); setDialog({ kind: "link" }); }
      else if (key === "enter") { e.preventDefault(); editor?.chain().focus().setPageBreak().run(); }
      else if (key === "y") { e.preventDefault(); editor?.chain().focus().redo().run(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  /* ---------- AI context menu ---------- */
  const aiQuick = async (action: string) => {
    if (!editor || !docRef.current) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n");
    setAiOpen(true);
    setPending(null);
    try {
      const r = await api.ai("rewrite", { action, document_id: docRef.current.id, params: { text, language: docRef.current.language } });
      setPending({ result: r, action, mode: ["explain", "citations"].includes(action) ? "insert" : "replace", range: { from, to } });
    } catch (e) { toast("error", errorMessage(e)); }
  };

  if (loadError) return <div className="p-8"><p className="text-danger">{loadError}</p><Button className="mt-4" onClick={() => nav("/reports")}>{t("reports")}</Button></div>;
  if (!editor || !doc) return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;

  const text = plainText(editor.getJSON() as any);
  const words = countWords(text);
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const effZoom = zoom;
  const stateBadge = { saved: <><Check className="h-3.5 w-3.5" />{t("saved")}</>, saving: <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("saving")}</>,
    unsaved: <>{t("unsaved")}</>, offline: <><CloudOff className="h-3.5 w-3.5" />{t("offline")}</>, conflict: <><AlertTriangle className="h-3.5 w-3.5" />{t("conflict")}</>,
    error: <><AlertTriangle className="h-3.5 w-3.5" />Error</> }[saveState];
  const close = () => setDialog({ kind: null });
  const d = dialog;

  return (
    <EditorServicesContext.Provider value={services}>
    <div className="flex h-full flex-col bg-slate-100 dark:bg-navy-950" data-testid="editor-page">
      {/* Top menu */}
      <div className="flex h-12 items-center gap-2 border-b border-slate-200 bg-white px-3 dark:border-navy-700 dark:bg-navy-900">
        <Button variant="ghost" size="sm" onClick={async () => { await doSave(); nav("/"); }} icon={<Back className="h-4 w-4" />} aria-label="back" />
        <img src="/favicon.svg" className="h-6 w-6" alt="" />
        <input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} aria-label={t("title")} data-testid="doc-title"
          className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 text-base font-semibold hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-navy-800 dark:focus:bg-navy-800" />
        <Select className="h-8 w-32 py-0 text-xs" value={doc.status} aria-label={t("status")}
          onChange={async (e) => { try { const r = await sync.save(docRef.current!, { status: e.target.value }); if (r.status !== "conflict") { docRef.current = r.doc; setDoc(r.doc); } } catch (x) { toast("error", errorMessage(x)); } }}>
          {["draft", "in_progress", "completed"].map((s) => <option key={s} value={s}>{t(s)}</option>)}</Select>
        <span className={cx("flex items-center gap-1 text-xs", saveState === "saved" ? "text-success" : saveState === "conflict" || saveState === "error" ? "text-danger" : "text-slate-500")} data-testid="save-state">{stateBadge}</span>
        <Badge>v{doc.version}</Badge>
      </div>
      <Ribbon editor={editor} layout={layout} setLayout={setLayout} open={(kind, payload) => setDialog({ kind, payload })} citationStyle={citationStyle}
        setCitationStyle={(s) => setLayout({ ...layout, citationStyle: s })} aiOpen={aiOpen} toggleAI={() => setAiOpen(!aiOpen)}
        file={{ save: () => doSave({ createVersion: true, label: "manual save" }), saveAs: () => setSaveAs(title + (lang === "ar" ? " - نسخة" : " - copy")),
          exportAs, print, newDoc: () => nav("/new"), openDoc: () => nav("/reports"), importDoc: () => importRef.current?.click() }}
        view={{ zoom, setZoom, ruler, setRuler, nav: navOpen, setNav: setNavOpen, multi, setMulti, fullscreen: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.() }}
        review={{ track, setTrack, spell, setSpell, panel: (p) => { setNavOpen(true); if (p === "comments:new") { setPanel("comments"); setNewComment(true); setTimeout(() => setNewComment(false), 100); } else setPanel(p as PanelTab); },
          aiGrammar: () => { if (editor.state.selection.empty) editor.commands.selectAll(); aiQuick("correct"); } }} />
      <input ref={importRef} type="file" hidden accept=".docx,.md,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return;
        try { const nd = await api.importDocument(f); nav(`/editor/${nd.id}`); } catch (x) { toast("error", errorMessage(x)); } }} />

      <div className="relative flex min-h-0 flex-1">
        {navOpen && <aside className="w-64 shrink-0 border-e border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-900">
          <SidePanel editor={editor} docId={doc.id} tab={panel} setTab={setPanel} lang={lang} newComment={newComment} onRestored={load} /></aside>}
        <div className="rsp-canvas relative" onClick={(e) => { if (e.target === e.currentTarget) editor.commands.focus("end"); }}>
          {d.kind === "find" && <FindReplace editor={editor} onClose={close} replaceMode={d.payload?.replace !== false} />}
          {multi && <MultiPageView docId={doc.id} getContent={() => editor.getJSON()} layout={layout} zoom={zoom}
              onOpen={() => setMulti(false)} lang={lang} />}
          {/* the editor stays mounted (hidden) so ProseMirror's DOM is never torn down under React */}
          <div style={{ display: multi ? "none" : undefined }}>
            {ruler && <Ruler layout={layout} zoom={effZoom} onChange={setLayout} />}
            <Canvas editor={editor} layout={layout} zoom={effZoom} title={title} spell={spell} lang={doc.language} onPages={setPages} />
          </div>
          <BubbleMenu editor={editor} tippyOptions={{ duration: 120, placement: "top" }} shouldShow={({ state }) => !state.selection.empty && state.selection.constructor.name === "TextSelection"}>
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-navy-700 dark:bg-navy-800"
              onMouseDown={(ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); }}>
              <button className="rounded px-2 py-1 text-sm font-bold hover:bg-slate-100 dark:hover:bg-navy-700" onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
              <button className="rounded px-2 py-1 text-sm italic hover:bg-slate-100 dark:hover:bg-navy-700" onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
              <Dropdown trigger={(o) => <button data-testid="ai-menu" onClick={o} className="flex items-center gap-1 rounded bg-ai-600 px-2 py-1 text-sm text-white"><Sparkles className="h-3.5 w-3.5" />AI</button>}>
                {(c) => <>{EDITOR_ACTIONS.filter(([a]) => ["improve", "rewrite", "expand", "summarize", "translate", "explain", "correct", "citations"].includes(a)).map(([a, ar, en]) =>
                  <MenuItem key={a} onClick={() => { c(); aiQuick(a); }}>{lang === "ar" ? ar : en}</MenuItem>)}</>}
              </Dropdown>
              <button className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-navy-700" onClick={() => { setNavOpen(true); setPanel("comments"); setNewComment(true); setTimeout(() => setNewComment(false), 100); }}>💬</button>
            </div>
          </BubbleMenu>
        </div>
        {aiOpen && <aside className="w-80 shrink-0 border-s border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-900" data-testid="ai-sidebar">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-navy-700">
            <span className="flex items-center gap-1 font-semibold text-ai-600"><Sparkles className="h-4 w-4" />AI</span>
            <button aria-label="close AI" onClick={() => setAiOpen(false)}><X className="h-4 w-4" /></button></div>
          <div className="h-[calc(100%-41px)]">
            {pending ? <AIResultPanel pending={pending} editor={editor} onClose={() => setPending(null)} />
              : <AISidebar editor={editor} docId={doc.id} docMeta={{ title, report_type: doc.report_type, language: doc.language, targetPages: doc.metadata?.targetPages }} onResult={setPending} />}
          </div></aside>}
      </div>

      {/* Status bar */}
      <div className="flex h-7 items-center gap-4 border-t border-slate-200 bg-white px-3 text-xs text-slate-500 dark:border-navy-700 dark:bg-navy-900" data-testid="status-bar">
        <span data-testid="page-count">{layout.columns === 1 ? `${pages} ${t("pages")}` : (lang === "ar" ? "عرض متصل (أعمدة)" : "Continuous view (columns)")}</span>
        <span data-testid="word-count">{words} {t("words")}</span><span>{text.length} {t("chars")}</span>
        <span>{layout.pageSize} · {layout.orientation === "portrait" ? "↕" : "↔"} · {layout.direction.toUpperCase()}</span>
        {track && <Badge color="amber">{lang === "ar" ? "تعقب التغييرات مفعل" : "Track changes on"}</Badge>}
        <div className="flex-1" />
        <button onClick={() => setZoom(Math.max(0.3, +(zoom - 0.1).toFixed(2)))}>−</button>
        <input type="range" min={30} max={200} value={Math.round(zoom * 100)} onChange={(e) => setZoom(+e.target.value / 100)} aria-label="zoom" className="w-24" />
        <button onClick={() => setZoom(Math.min(3, +(zoom + 0.1).toFixed(2)))}>+</button><span className="w-10">{Math.round(effZoom * 100)}%</span>
      </div>

      {/* Dialogs */}
      {d.kind === "table" && <TableDialog editor={editor} onClose={close} />}
      {d.kind === "image" && <ImageDialog editor={editor} onClose={close} />}
      {d.kind === "crop" && <CropDialog editor={editor} onClose={close} />}
      {d.kind === "chart" && <ChartDialog editor={editor} onClose={close} initial={d.payload?.attrs} pos={d.payload?.pos} />}
      {d.kind === "shape" && <ShapeDialog editor={editor} onClose={close} />}
      {d.kind === "equation" && <EquationDialog editor={editor} onClose={close} initial={d.payload?.attrs} pos={d.payload?.pos} />}
      {d.kind === "link" && <LinkDialog editor={editor} onClose={close} />}
      {d.kind === "footnote" && <FootnoteDialog editor={editor} onClose={close} initial={d.payload?.attrs} pos={d.payload?.pos} />}
      {d.kind === "cover" && <CoverDialog editor={editor} onClose={close} initial={d.payload.attrs} pos={d.payload.pos} />}
      {d.kind === "citation" && <CitationDialog editor={editor} onClose={close} sources={sources} reload={() => api.sources().then(setSources)} />}
      {d.kind === "pageSetup" && <PageSetupDialog layout={layout} onChange={setLayout} onClose={close} />}
      {d.kind === "headerFooter" && <HeaderFooterDialog layout={layout} onChange={setLayout} onClose={close} />}
      <Dialog open={!!preview} onClose={() => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); }} title={lang === "ar" ? "معاينة الطباعة" : "Print preview"} wide="xl"
        footer={<><Button variant="secondary" onClick={() => exportAs("pdf")}>PDF</Button>
          <Button onClick={() => (document.getElementById("rsp-print-frame") as HTMLIFrameElement)?.contentWindow?.print()}>{lang === "ar" ? "طباعة" : "Print"}</Button></>}>
        {preview && <iframe id="rsp-print-frame" title="preview" src={preview.url} className="h-[70vh] w-full rounded border" data-testid="print-preview" />}
      </Dialog>
      <Dialog open={saveAs !== null} onClose={() => setSaveAs(null)} title={lang === "ar" ? "حفظ باسم" : "Save as"}
        footer={<Button disabled={!saveAs?.trim()} onClick={async () => {
          try { const n = await api.createDocument({ title: saveAs!.trim(), content: editor.getJSON(), layout, language: doc.language, report_type: doc.report_type,
            metadata: doc.metadata, project_id: doc.project_id }); setSaveAs(null); nav(`/editor/${n.id}`); } catch (x) { toast("error", errorMessage(x)); } }}>{t("save")}</Button>}>
        <Input value={saveAs || ""} onChange={(e) => setSaveAs(e.target.value)} />
      </Dialog>
    </div>
    </EditorServicesContext.Provider>
  );
}
