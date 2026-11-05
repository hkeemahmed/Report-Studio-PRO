import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, History, MessageSquare, Navigation, RotateCcw, ClipboardCheck, GitCompare, Trash2, Upload } from "lucide-react";
import type { DiffResult, Version } from "@rsp/shared-types";
import { Badge, Button, IconButton, Select, Spinner, Tabs, Textarea, useToast } from "@rsp/ui-components";
import { api, errorMessage } from "../lib/api";
import { fmtDate } from "../lib/useAsync";
import { DiffOps } from "../components/DiffView";

const L = (a: string, e: string) => (document.documentElement.lang === "ar" ? a : e);
export type PanelTab = "nav" | "comments" | "versions" | "review" | "compare";

function Nav({ editor }: { editor: Editor }) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((t) => t + 1); editor.on("update", f); return () => { editor.off("update", f); }; }, [editor]);
  const items: { level: number; text: string; pos: number }[] = [];
  editor.state.doc.forEach((n, pos) => { if (n.type.name === "heading" && n.textContent.trim()) items.push({ level: n.attrs.level, text: n.textContent, pos }); });
  if (!items.length) return <p className="p-3 text-sm text-slate-500">{L("أضف عناوين لتظهر هنا", "Add headings to see them here")}</p>;
  return (
    <ul className="space-y-0.5 p-2 text-sm" data-testid="nav-panel">
      {items.map((i, k) => <li key={k}><button className="w-full truncate rounded px-2 py-1 text-start hover:bg-slate-100 dark:hover:bg-navy-800" style={{ paddingInlineStart: 8 + (i.level - 1) * 14 }}
        onClick={() => { editor.commands.focus(i.pos + 1); (editor.view.nodeDOM(i.pos) as HTMLElement)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{i.text}</button></li>)}
    </ul>
  );
}

function Comments({ editor, docId, startNew, lang }: { editor: Editor; docId: string; startNew: boolean; lang: string }) {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [body, setBody] = useState("");
  const [adding, setAdding] = useState(startNew);
  const load = () => api.comments(docId).then(setList).catch((e) => toast("error", errorMessage(e)));
  useEffect(() => { load(); }, [docId]);
  useEffect(() => setAdding(startNew), [startNew]);
  const add = async () => {
    const { from, to } = editor.state.selection;
    const anchor = editor.state.doc.textBetween(from, to, " ");
    try {
      const c = await api.addComment(docId, body, anchor);
      if (from !== to) editor.chain().setTextSelection({ from, to }).setComment(c.id).run();
      setBody(""); setAdding(false); load();
    } catch (e) { toast("error", errorMessage(e)); }
  };
  const goto = (id: string) => {
    let found = -1;
    editor.state.doc.descendants((n, pos) => { if (found < 0 && n.marks.some((m) => m.type.name === "comment" && m.attrs.commentId === id)) found = pos; });
    if (found >= 0) { editor.commands.setTextSelection(found); (editor.view.domAtPos(found).node as HTMLElement).parentElement?.scrollIntoView({ block: "center" }); }
  };
  return (
    <div className="space-y-2 p-2 text-sm">
      {adding ? <div className="space-y-2 rounded border p-2 dark:border-navy-700">
        <Textarea rows={3} autoFocus placeholder={L("اكتب تعليقك على النص المحدد…", "Comment on the selected text…")} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex gap-2"><Button size="sm" disabled={!body.trim()} onClick={add}>{L("إضافة", "Add")}</Button><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>{L("إلغاء", "Cancel")}</Button></div>
      </div> : <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>{L("تعليق جديد", "New comment")}</Button>}
      {list === null ? <Spinner /> : list.length === 0 ? <p className="text-slate-500">{L("لا توجد تعليقات", "No comments")}</p> : list.map((c) => (
        <div key={c.id} className={`rounded border p-2 dark:border-navy-700 ${c.resolved ? "opacity-60" : ""}`}>
          {c.anchor_text && <button onClick={() => goto(c.id)} className="mb-1 block w-full truncate border-s-2 border-amber-400 ps-2 text-start text-xs text-slate-500">"{c.anchor_text}"</button>}
          <p className="whitespace-pre-wrap" dir="auto">{c.body}</p>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>{fmtDate(c.created_at, lang)}</span>
            <span className="flex gap-1">
              <IconButton label={c.resolved ? L("إعادة فتح", "Reopen") : L("حل", "Resolve")} onClick={async () => { await api.resolveComment(docId, c.id, !c.resolved); load(); }}><Check className="h-3.5 w-3.5" /></IconButton>
              <IconButton label={L("حذف", "Delete")} onClick={async () => { await api.deleteComment(docId, c.id); editor.commands.unsetComment(c.id); load(); }}><Trash2 className="h-3.5 w-3.5 text-danger" /></IconButton>
            </span>
          </div>
        </div>))}
    </div>
  );
}

function Versions({ docId, lang, onRestored }: { docId: string; lang: string; onRestored: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<Version[] | null>(null);
  const [diff, setDiff] = useState<{ v: number; d: DiffResult } | null>(null);
  useEffect(() => { api.versions(docId).then(setList).catch((e) => toast("error", errorMessage(e))); }, [docId]);
  return (
    <div className="space-y-1 p-2 text-sm" data-testid="versions">
      {list === null ? <Spinner /> : list.map((v) => (
        <div key={v.id} className="rounded border p-2 dark:border-navy-700">
          <div className="flex items-center justify-between"><b>v{v.version}</b>{v.label && <Badge>{v.label}</Badge>}</div>
          <div className="text-xs text-slate-500">{fmtDate(v.created_at, lang)}</div>
          <div className="mt-1 flex gap-1">
            <Button size="sm" variant="ghost" icon={<GitCompare className="h-3.5 w-3.5" />} onClick={async () => setDiff({ v: v.version, d: await api.compareVersions(docId, v.version) })}>{L("مقارنة بالحالي", "Compare to current")}</Button>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={async () => { try { await api.restoreVersion(docId, v.version); toast("success", L("تمت الاستعادة", "Restored")); onRestored(); } catch (e) { toast("error", errorMessage(e)); } }}>{L("استعادة", "Restore")}</Button>
          </div>
          {diff?.v === v.version && <div className="mt-2"><DiffOps diff={diff.d} /></div>}
        </div>))}
    </div>
  );
}

function Review({ docId, editor }: { docId: string; editor: Editor }) {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setR(await api.review(docId)); } finally { setBusy(false); } };
  useEffect(() => { run(); }, [docId]);
  const label: Record<string, [string, string]> = { repeated_word: ["كلمة مكررة", "Repeated word"], double_space: ["مسافة مزدوجة", "Double space"],
    space_before_punctuation: ["مسافة قبل علامة ترقيم", "Space before punctuation"], missing_space_after_punctuation: ["لا مسافة بعد علامة ترقيم", "No space after punctuation"],
    latin_question_mark_in_arabic: ["علامة استفهام لاتينية في نص عربي", "Latin ? in Arabic text"], repeated_sentence: ["جملة مكررة", "Repeated sentence"],
    long_sentence: ["جملة طويلة", "Long sentence"], missing_section: ["قسم ناقص", "Missing section"], empty_section: ["قسم فارغ", "Empty section"] };
  return (
    <div className="space-y-2 p-2 text-sm">
      <Button size="sm" variant="secondary" loading={busy} onClick={run}>{L("تحديث (احفظ أولاً)", "Refresh (save first)")}</Button>
      {r && <>
        <div className="rounded bg-slate-50 p-2 dark:bg-navy-800"><div className="text-2xl font-bold">{r.score}/10</div>
          <div className="text-xs text-slate-500">{r.stats.words} {L("كلمة", "words")} · {r.stats.sentences} {L("جملة", "sentences")} · {r.stats.reading_minutes} {L("دقيقة قراءة", "min read")}</div></div>
        {r.issues.map((i: any, k: number) => (
          <button key={k} className="block w-full rounded border p-2 text-start hover:bg-slate-50 dark:border-navy-700 dark:hover:bg-navy-800"
            onClick={() => { if (i.text && i.type !== "missing_section") { editor.commands.setSearchTerm(i.text.trim().slice(0, 60)); editor.commands.nextMatch(); } }}>
            <Badge color={i.severity === "warning" ? "amber" : "slate"}>{L(...(label[i.type] || [i.type, i.type]))}</Badge>
            <div className="mt-1 truncate text-xs" dir="auto">{i.text}{i.suggestion ? ` → ${i.suggestion}` : ""}</div></button>))}
        <p className="text-[11px] text-slate-500">{L("فحوص قائمة على القواعد.", "Rule-based checks.")}</p>
      </>}
      <Similarity docId={docId} />
    </div>
  );
}

function Similarity({ docId }: { docId: string }) {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 border-t pt-3 dark:border-navy-700" data-testid="similarity">
      <Button size="sm" variant="secondary" loading={busy} onClick={async () => { setBusy(true); try { setR(await api.similarity(docId)); } finally { setBusy(false); } }}>
        {L("فحص التشابه مع مصادري وتقاريري", "Similarity vs my sources & reports")}</Button>
      {r && <>
        <div className="text-lg font-bold">{r.overall_percent}% <span className="text-xs font-normal text-slate-500">{L("تطابق", "overlap")} · {r.checked_sources} {L("مصدر", "sources")}</span></div>
        {r.matches.map((m: any) => (
          <details key={m.source_id} className="rounded border p-2 text-xs dark:border-navy-700"><summary><b>{m.percent}%</b> {m.title}</summary>
            {m.passages.map((p: string, i: number) => <p key={i} className="mt-1 text-slate-500" dir="auto">«{p}»</p>)}</details>))}
        <p className="text-[11px] text-slate-500">{L("المقارنة مع ملفاتك وتقارير مساحة العمل فقط، وليست فحص انتحال عبر الإنترنت.",
          "Compared with your files and workspace reports only — not an internet plagiarism check.")}</p>
      </>}
    </div>
  );
}

function Compare({ docId, editor }: { docId: string; editor: Editor }) {
  const toast = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [a, setA] = useState(""), [diff, setDiff] = useState<DiffResult | null>(null);
  useEffect(() => { api.versions(docId).then((v) => { setVersions(v); setA(String(v[v.length - 1]?.version || "")); }); }, [docId]);
  const fromFile = async (f?: File) => {
    if (!f) return;
    try { const imported = await api.importDocument(f); setDiff(await api.compareDocs(imported.content, editor.getJSON()));
      await api.deleteDocument(imported.id); } catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <div className="space-y-3 p-2 text-sm">
      <div className="flex gap-2"><Select value={a} onChange={(e) => setA(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.version}>v{v.version} {v.label}</option>)}</Select>
        <Button size="sm" onClick={async () => setDiff(await api.compareDocs((await api.version(docId, +a)).content, editor.getJSON()))}>{L("مقارنة", "Compare")}</Button></div>
      <label className="flex cursor-pointer items-center gap-2 text-primary-500"><Upload className="h-4 w-4" />{L("مقارنة بملف Word…", "Compare with a Word file…")}
        <input type="file" hidden accept=".docx,.txt,.md" onChange={(e) => fromFile(e.target.files?.[0])} /></label>
      {diff && <DiffOps diff={diff} />}
    </div>
  );
}

export default function SidePanel({ editor, docId, tab, setTab, lang, newComment, onRestored }: { editor: Editor; docId: string; tab: PanelTab; setTab: (t: PanelTab) => void;
  lang: string; newComment: boolean; onRestored: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <Tabs className="px-1" value={tab} onChange={setTab} tabs={[
        { id: "nav", label: <Navigation className="h-4 w-4" aria-label="navigation" /> }, { id: "comments", label: <MessageSquare className="h-4 w-4" aria-label="comments" /> },
        { id: "versions", label: <History className="h-4 w-4" aria-label="versions" /> }, { id: "review", label: <ClipboardCheck className="h-4 w-4" aria-label="review" /> },
        { id: "compare", label: <GitCompare className="h-4 w-4" aria-label="compare" /> }]} />
      <div className="flex-1 overflow-auto">
        {tab === "nav" && <Nav editor={editor} />}
        {tab === "comments" && <Comments editor={editor} docId={docId} startNew={newComment} lang={lang} />}
        {tab === "versions" && <Versions docId={docId} lang={lang} onRestored={onRestored} />}
        {tab === "review" && <Review docId={docId} editor={editor} />}
        {tab === "compare" && <Compare docId={docId} editor={editor} />}
      </div>
    </div>
  );
}
