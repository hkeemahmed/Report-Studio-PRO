import { useRef, useState } from "react";
import { Brain, Eye, FileText, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, Confirm, Dialog, IconButton, Spinner, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
import { fmtDate, useAsync } from "../lib/useAsync";

export default function SourcesPage() {
  const { t, lang } = useI18n();
  const ar = lang === "ar";
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const { data, loading, reload } = useAsync(() => api.assets("source"), []);
  const [busy, setBusy] = useState("");
  const [view, setView] = useState<{ name: string; text: string } | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      setBusy("upload");
      try { await api.upload(f, "source"); toast("success", f.name); } catch (e) { toast("error", `${f.name}: ${errorMessage(e)}`); }
    }
    setBusy(""); reload();
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">{t("sources")}</h1>
          <p className="text-sm text-slate-500">{ar ? "ارفع ملفات PDF أو DOCX أو TXT ليستخدمها المساعد الذكي (RAG) في الإجابة مع الإشارة إلى المصدر والصفحة."
            : "Upload PDF, DOCX or TXT files for the AI assistant (RAG) to answer from, with file and page references."}</p></div>
        <input ref={ref} type="file" multiple hidden accept=".pdf,.docx,.txt,.md" onChange={(e) => upload(e.target.files)} />
        <Button icon={<Upload className="h-4 w-4" />} loading={busy === "upload"} onClick={() => ref.current?.click()}>{ar ? "رفع ملفات" : "Upload files"}</Button>
      </div>
      <Card>
        {loading ? <Spinner /> : !data?.length ? <p className="py-8 text-center text-slate-500">{t("none")}</p> : (
          <div className="divide-y dark:divide-navy-700">
            {data.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-3">
                <FileText className="h-5 w-5 text-primary-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.filename}</div>
                  <div className="text-xs text-slate-500">{(a.size_bytes / 1024).toFixed(0)} KB · {a.text_chars.toLocaleString()} {ar ? "حرف" : "chars"} · {a.chunk_count} {ar ? "مقطع" : "chunks"} · {fmtDate(a.created_at, lang)}</div>
                </div>
                {a.embedded ? <Badge color="violet">{ar ? "بحث دلالي" : "Semantic"}</Badge> : <Badge>{ar ? "بحث نصي" : "Lexical"}</Badge>}
                {!a.embedded && <Button size="sm" variant="ai" icon={<Brain className="h-4 w-4" />} loading={busy === a.id}
                  onClick={async () => { setBusy(a.id); try { await api.embedSource(a.id); reload(); } catch (e) { toast("error", errorMessage(e)); } finally { setBusy(""); } }}>{ar ? "إنشاء Embeddings" : "Create embeddings"}</Button>}
                <IconButton label={ar ? "عرض النص" : "View text"} onClick={async () => setView({ name: a.filename, text: (await api.assetText(a.id)).text })}><Eye className="h-4 w-4" /></IconButton>
                <IconButton label={t("delete")} onClick={() => setDel(a.id)}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
              </div>))}
          </div>)}
      </Card>
      <Dialog open={!!view} onClose={() => setView(null)} title={view?.name || ""} wide><pre dir="auto" className="whitespace-pre-wrap font-doc text-sm">{view?.text}</pre></Dialog>
      <Confirm open={!!del} text={t("confirmDelete")} confirmLabel={t("delete")} cancelLabel={t("cancel")} onClose={() => setDel(null)}
        onConfirm={async () => { await api.deleteAsset(del!); reload(); }} />
    </div>
  );
}
