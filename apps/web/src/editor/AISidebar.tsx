import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BarChart3, BookOpenCheck, FileSearch, PenLine, Sparkles, Wand2 } from "lucide-react";
import type { AIResult, Asset, Provider } from "@rsp/shared-types";
import { markdownToNodes, plainText } from "@rsp/document-schema";
import { Badge, Button, Field, Input, Select, Spinner, Tabs, Textarea, useToast } from "@rsp/ui-components";
import { api, errorMessage } from "../lib/api";

const L = (a: string, e: string) => (document.documentElement.lang === "ar" ? a : e);

export const WRITER = [["full_report", "تقرير كامل", "Full report"], ["introduction", "مقدمة", "Introduction"], ["conclusion", "خاتمة", "Conclusion"],
  ["objectives", "أهداف", "Objectives"], ["abstract", "ملخص", "Abstract"], ["chapters", "فصول", "Chapters outline"],
  ["subheadings", "عناوين فرعية", "Sub-headings"], ["section", "كتابة قسم", "Write a section"]] as const;
export const EDITOR_ACTIONS = [["improve", "تحسين الكتابة", "Improve writing"], ["rewrite", "إعادة الصياغة", "Rewrite"], ["expand", "توسيع", "Expand"],
  ["summarize", "تلخيص", "Summarize"], ["shorten", "اختصار", "Shorten"], ["correct", "تصحيح الأخطاء", "Correct grammar"],
  ["academic", "لغة أكاديمية", "Academic tone"], ["translate", "ترجمة", "Translate"], ["explain", "شرح", "Explain"], ["citations", "اقتراح استشهادات", "Generate citations"]] as const;
const ANALYSIS = [["analyze_data", "تحليل البيانات", "Analyze data"], ["make_table", "إنشاء جدول", "Create table"], ["suggest_chart", "اقتراح رسم بياني", "Suggest chart"],
  ["discussion", "المناقشة والاستنتاجات", "Discussion & conclusions"], ["review", "تقييم جودة الكتابة", "Writing quality review"]] as const;

export interface PendingResult { result: AIResult; action: string; mode: "replace" | "insert"; range?: { from: number; to: number } }

export default function AISidebar({ editor, docId, docMeta, onResult }: { editor: Editor; docId: string; docMeta: { title: string; report_type: string; language: string; targetPages?: number };
  onResult: (r: PendingResult) => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<"writer" | "editor" | "research" | "analysis">("writer");
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [providerId, setProviderId] = useState("");
  const [busy, setBusy] = useState("");
  const [instructions, setInstructions] = useState("");
  const [heading, setHeading] = useState("");
  const [question, setQuestion] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [data, setData] = useState("");
  useEffect(() => { api.providers().then((p) => { setProviders(p); setProviderId(p.find((x) => x.is_default)?.id || p[0]?.id || ""); }).catch(() => setProviders([])); }, []);
  useEffect(() => { if (tab === "research") api.assets("source").then(setAssets).catch(() => {}); }, [tab]);

  const selection = () => { const { from, to } = editor.state.selection; return { from, to, text: editor.state.doc.textBetween(from, to, "\n") }; };
  const run = async (endpoint: "generate" | "rewrite" | "analyze", action: string, extra: Record<string, any> = {}, mode: "replace" | "insert" = "insert") => {
    setBusy(action);
    const sel = selection();
    try {
      const r = await api.ai(endpoint, { action, document_id: docId, provider_id: providerId || undefined, params: {
        title: docMeta.title, report_type: docMeta.report_type, language: docMeta.language, pages: docMeta.targetPages || 5,
        structure: editor.getJSON().content?.filter((n: any) => n.type === "heading").map((n: any) => n.content?.[0]?.text).join(", ") || "standard",
        instructions, ...extra } });
      onResult({ result: r, action, mode, range: mode === "replace" ? { from: sel.from, to: sel.to } : undefined });
    } catch (e) { toast("error", errorMessage(e)); } finally { setBusy(""); }
  };

  if (providers === null) return <div className="p-4"><Spinner /></div>;
  if (!providers.length) return (
    <div className="space-y-3 p-4 text-sm">
      <p>{L("لم يتم إعداد أي مزود ذكاء اصطناعي بعد.", "No AI provider configured yet.")}</p>
      <p className="text-slate-500">{L("أضف OpenAI أو Ollama (محلي) من الإعدادات ← مزودو الذكاء الاصطناعي. تُحفظ المفاتيح مشفرة على الخادم فقط.",
        "Add OpenAI or Ollama (local) in Settings → AI providers. Keys are stored encrypted on the server only.")}</p>
      <Button size="sm" onClick={() => (location.hash = "#/settings")}>{L("فتح الإعدادات", "Open settings")}</Button>
    </div>);
  const docText = () => plainText(editor.getJSON() as any);
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-navy-700">
        <Select aria-label="AI provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.model || p.type}</option>)}</Select>
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "writer", label: <PenLine className="h-4 w-4" /> }, { id: "editor", label: <Wand2 className="h-4 w-4" /> },
          { id: "research", label: <FileSearch className="h-4 w-4" /> }, { id: "analysis", label: <BarChart3 className="h-4 w-4" /> }]} />
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
        <Field label={L("تعليمات إضافية (اختياري)", "Extra instructions (optional)")}><Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
        {tab === "writer" && <>
          <h3 className="font-semibold">AI Writer</h3>
          <div className="grid grid-cols-2 gap-2">
            {WRITER.filter(([a]) => a !== "section").map(([a, ar, en]) => (
              <Button key={a} size="sm" variant="secondary" loading={busy === a} disabled={!!busy}
                onClick={() => run("generate", a, a === "conclusion" || a === "abstract" ? { text: docText().slice(0, 20000) } : a === "subheadings" ? { text: selection().text || docText().slice(0, 4000) } : {})}>{L(ar, en)}</Button>))}
          </div>
          <div className="flex gap-2"><Input placeholder={L("عنوان القسم", "Section heading")} value={heading} onChange={(e) => setHeading(e.target.value)} />
            <Button size="sm" variant="ai" disabled={!heading || !!busy} loading={busy === "section"} onClick={() => run("generate", "section", { heading })}>{L("اكتب", "Write")}</Button></div>
        </>}
        {tab === "editor" && <>
          <h3 className="font-semibold">AI Editor</h3>
          <p className="text-xs text-slate-500">{L("حدد نصاً في المستند ثم اختر إجراءً. سترى النتيجة قبل الاستبدال.", "Select text in the document, then choose an action. You'll preview before replacing.")}</p>
          <div className="grid grid-cols-2 gap-2">
            {EDITOR_ACTIONS.map(([a, ar, en]) => (
              <Button key={a} size="sm" variant="secondary" loading={busy === a} disabled={!!busy}
                onClick={() => { const s = selection(); if (!s.text.trim()) { toast("warning", L("حدد نصاً أولاً", "Select some text first")); return; }
                  run("rewrite", a, { text: s.text }, ["explain", "citations"].includes(a) ? "insert" : "replace"); }}>{L(ar, en)}</Button>))}
          </div>
        </>}
        {tab === "research" && <>
          <h3 className="font-semibold">AI Research (RAG)</h3>
          <p className="text-xs text-slate-500">{L("يجيب فقط من الملفات المرفوعة مع الإشارة للمصدر والصفحة. ارفع الملفات من صفحة مصادر البحث.",
            "Answers only from your uploaded files, citing file and page. Upload files on the Research Sources page.")}</p>
          <div className="max-h-40 space-y-1 overflow-auto rounded border p-2 dark:border-navy-700">
            {assets.length === 0 && <p className="text-xs text-slate-500">{L("لا توجد ملفات", "No files")}</p>}
            {assets.map((a) => <label key={a.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={picked.includes(a.id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} />{a.filename}{a.embedded && <Badge color="violet">vec</Badge>}</label>)}
          </div>
          <Textarea rows={3} placeholder={L("سؤالك عن المصادر…", "Your question about the sources…")} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <Button variant="ai" className="w-full" disabled={!question.trim() || !!busy} loading={busy === "research"} icon={<BookOpenCheck className="h-4 w-4" />}
            onClick={async () => { setBusy("research");
              try { const r = await api.research({ question, asset_ids: picked, document_id: docId, provider_id: providerId || undefined, language: docMeta.language });
                onResult({ result: r, action: "research", mode: "insert" }); } catch (e) { toast("error", errorMessage(e)); } finally { setBusy(""); } }}>{L("اسأل المصادر", "Ask sources")}</Button>
        </>}
        {tab === "analysis" && <>
          <h3 className="font-semibold">AI Analysis</h3>
          <Textarea rows={6} dir="ltr" className="font-mono text-xs" placeholder={L("ألصق البيانات أو النتائج (أو حدد جدولاً في المستند)", "Paste data/results (or select a table in the document)")} value={data} onChange={(e) => setData(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            {ANALYSIS.map(([a, ar, en]) => (
              <Button key={a} size="sm" variant="secondary" loading={busy === a} disabled={!!busy}
                onClick={() => { const text = data.trim() || selection().text || (a === "review" ? docText() : ""); if (!text) { toast("warning", L("أدخل بيانات أولاً", "Enter data first")); return; }
                  run("analyze", a, { text: text.slice(0, 50000) }); }}>{L(ar, en)}</Button>))}
          </div>
        </>}
      </div>
      <div className="border-t border-slate-200 p-2 text-center text-[11px] text-slate-500 dark:border-navy-700"><Sparkles className="me-1 inline h-3 w-3 text-ai-500" />
        {L("راجع المحتوى المولّد دائماً؛ لا يُضاف شيء دون موافقتك.", "Always review generated content; nothing is inserted without your approval.")}</div>
    </div>
  );
}

/** Preview of AI output with explicit accept: replace selection / insert / copy / discard. */
export function AIResultPanel({ pending, editor, onClose }: { pending: PendingResult; editor: Editor; onClose: () => void }) {
  const [text, setText] = useState(pending.result.text);
  const insertNodes = (replace: boolean) => {
    const isChart = pending.action === "suggest_chart";
    if (isChart) {
      try { const spec = JSON.parse(text); editor.chain().focus().insertChart({ spec, caption: spec.title || "", width: "80%" }).run(); } catch { return; }
      onClose(); return;
    }
    const nodes = markdownToNodes(text);
    if (pending.action === "research" && pending.result.sources.length) {
      nodes.push({ type: "paragraph", content: [{ type: "text", text: pending.result.sources.map((s) => `[${s.id}] ${s.filename}, p.${s.page}`).join("; "), marks: [{ type: "italic" }] }] });
    }
    const chain = editor.chain().focus();
    if (replace && pending.range && pending.range.from !== pending.range.to) {
      // single paragraph -> replace inline text only, keeping surrounding block
      if (nodes.length === 1 && nodes[0].type === "paragraph") chain.insertContentAt(pending.range, nodes[0].content || []).run();
      else chain.insertContentAt(pending.range, nodes).run();
    } else chain.insertContent(nodes).run();
    onClose();
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-navy-700">
        <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-ai-500" />{L("معاينة النتيجة", "Preview result")}</h3>
        <Badge color="violet">{pending.result.provider} · {pending.result.model}</Badge>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        <Textarea dir="auto" className="min-h-[300px] font-doc text-base leading-7" value={text} onChange={(e) => setText(e.target.value)} data-testid="ai-result" />
        {pending.result.sources.length > 0 && <div className="space-y-1 text-xs">
          <div className="font-semibold">{L("المصادر", "Sources")} ({pending.result.retrieval})</div>
          {pending.result.sources.map((s) => <details key={s.id}><summary>[{s.id}] {s.filename} — p.{s.page}</summary><p className="whitespace-pre-wrap text-slate-500" dir="auto">{s.excerpt}</p></details>)}
        </div>}
        <div className="text-xs text-slate-500">{pending.result.prompt_tokens + pending.result.completion_tokens} tokens</div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 p-3 dark:border-navy-700">
        {pending.mode === "replace" && <Button size="sm" onClick={() => insertNodes(true)}>{L("استبدال النص المحدد", "Replace selection")}</Button>}
        <Button size="sm" variant={pending.mode === "replace" ? "secondary" : "primary"} onClick={() => { if (pending.range) editor.commands.setTextSelection(pending.range.to); insertNodes(false); }}>{L("إدراج", "Insert")}</Button>
        <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(text)}>{L("نسخ", "Copy")}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>{L("تجاهل", "Discard")}</Button>
      </div>
    </div>
  );
}
