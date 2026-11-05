import { useSearchParams, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button, Card, Input, Select, Spinner, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import DocList from "../components/DocList";

export default function ReportsPage() {
  const { t } = useI18n();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(sp.get("q") || "");
  const status = sp.get("status") || "", fav = sp.get("favorite") || "", tag = sp.get("tag") || "";
  const params: Record<string, string> = { q: sp.get("q") || "" };
  if (status) params.status = status; if (fav) params.favorite = fav; if (tag) params.tag = tag;
  const { data, loading, error, reload } = useAsync(() => api.documents(params), [sp.toString()]);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n); };
  const onImport = async (f?: File) => {
    if (!f) return;
    try { const d = await api.importDocument(f); toast("success", d.title); nav(`/editor/${d.id}`); } catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("reports")}</h1>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" hidden accept=".docx,.md,.txt" onChange={(e) => onImport(e.target.files?.[0])} />
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>{t("importDoc")}</Button>
          <Button onClick={() => nav("/new")}>{t("newReport")}</Button>
        </div>
      </div>
      <Card className="flex flex-wrap gap-3">
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); set("q", q); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("quickSearch")} /><Button type="submit" variant="secondary">{t("search")}</Button>
        </form>
        <Select className="w-40" value={status} onChange={(e) => set("status", e.target.value)} aria-label={t("status")}>
          <option value="">{t("status")}: *</option>
          {["draft", "in_progress", "completed"].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </Select>
        <Select className="w-36" value={fav} onChange={(e) => set("favorite", e.target.value)} aria-label={t("favorites")}>
          <option value="">{t("favorites")}: *</option><option value="true">★ {t("favorites")}</option>
        </Select>
        <Input className="w-36" placeholder={t("tags")} defaultValue={tag} onBlur={(e) => set("tag", e.target.value.trim())} />
      </Card>
      <Card>{loading ? <Spinner /> : error ? <p className="text-danger">{error}</p> : <DocList docs={data!} onChange={reload} />}</Card>
    </div>
  );
}
