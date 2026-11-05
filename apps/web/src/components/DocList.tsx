import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Copy, FileText, MoreVertical, Star, Tag, Trash2 } from "lucide-react";
import type { DocumentSummary } from "@rsp/shared-types";
import { Badge, Button, Confirm, Dialog, Dropdown, EmptyState, IconButton, Input, MenuItem, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
import { fmtDate } from "../lib/useAsync";

const statusColor = { draft: "slate", in_progress: "amber", completed: "green" } as const;

export default function DocList({ docs, onChange }: { docs: DocumentSummary[]; onChange: () => void }) {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [del, setDel] = useState<DocumentSummary | null>(null);
  const [tagDoc, setTagDoc] = useState<DocumentSummary | null>(null);
  const [tags, setTags] = useState("");
  const run = async (fn: () => Promise<any>) => { try { await fn(); onChange(); } catch (e) { toast("error", errorMessage(e)); } };
  if (!docs.length) return <EmptyState icon={<FileText className="h-10 w-10" />} title={t("none")} action={<Button onClick={() => nav("/new")}>{t("newReport")}</Button>} />;
  return (
    <div className="divide-y divide-slate-100 dark:divide-navy-700">
      {docs.map((d) => (
        <div key={d.id} className="flex items-center gap-3 py-2.5">
          <FileText className="h-5 w-5 shrink-0 text-primary-500" />
          <button className="min-w-0 flex-1 text-start" onClick={() => nav(`/editor/${d.id}`)}>
            <div className="truncate font-medium hover:text-primary-600">{d.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{fmtDate(d.updated_at, lang)}</span><span>·</span><span>{t("t_" + d.report_type)}</span><span>· v{d.version}</span>
              {d.tags.map((x) => <Badge key={x} color="violet">{x}</Badge>)}
            </div>
          </button>
          <Badge color={statusColor[d.status]}>{t(d.status)}</Badge>
          <IconButton label={t("favorite")} active={d.is_favorite}
            onClick={() => run(() => api.updateDocument(d.id, { base_version: d.version, is_favorite: !d.is_favorite }))}>
            <Star className={d.is_favorite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} /></IconButton>
          <Dropdown align="end" trigger={(o) => <IconButton label="More" onClick={o}><MoreVertical className="h-4 w-4" /></IconButton>}>
            {(close) => <>
              <MenuItem icon={<FileText className="h-4 w-4" />} onClick={() => { close(); nav(`/editor/${d.id}`); }}>{t("open")}</MenuItem>
              <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => { close(); run(() => api.duplicateDocument(d.id)); }}>{t("duplicate")}</MenuItem>
              <MenuItem icon={<Tag className="h-4 w-4" />} onClick={() => { close(); setTagDoc(d); setTags(d.tags.join(", ")); }}>{t("tags")}</MenuItem>
              {(["draft", "in_progress", "completed"] as const).filter((s) => s !== d.status).map((s) =>
                <MenuItem key={s} onClick={() => { close(); run(() => api.updateDocument(d.id, { base_version: d.version, status: s })); }}>→ {t(s)}</MenuItem>)}
              <MenuItem danger icon={<Trash2 className="h-4 w-4" />} onClick={() => { close(); setDel(d); }}>{t("delete")}</MenuItem>
            </>}
          </Dropdown>
        </div>
      ))}
      <Confirm open={!!del} text={`${t("confirmDelete")}\n${del?.title}`} confirmLabel={t("delete")} cancelLabel={t("cancel")}
        onClose={() => setDel(null)} onConfirm={() => del && run(() => api.deleteDocument(del.id))} />
      <Dialog open={!!tagDoc} onClose={() => setTagDoc(null)} title={t("tags")}
        footer={<Button onClick={() => { const d = tagDoc!; setTagDoc(null); run(() => api.setTags(d.id, tags.split(/[,،]/).map((s) => s.trim()).filter(Boolean))); }}>{t("save")}</Button>}>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="AI, lab, 2025" />
      </Dialog>
    </div>
  );
}
