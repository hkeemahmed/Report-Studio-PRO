import { useState } from "react";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { Source } from "@rsp/shared-types";
import { Badge, Button, Card, Confirm, Dialog, Field, IconButton, Input, Select, Spinner, Textarea, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
import { useAsync } from "../lib/useAsync";

const TYPES = ["book", "article", "journal", "website", "thesis", "report", "conference", "other"];
const DATA_FIELDS: Record<string, [string, string, string][]> = {
  common: [["journal", "المجلة/الكتاب الأم", "Journal / container"], ["volume", "المجلد", "Volume"], ["issue", "العدد", "Issue"], ["pages", "الصفحات", "Pages"],
    ["publisher", "الناشر", "Publisher"], ["place", "مكان النشر", "Place"], ["edition", "الطبعة", "Edition"], ["url", "الرابط", "URL"], ["accessed", "تاريخ الوصول", "Accessed"],
    ["university", "الجامعة (للرسائل)", "University (theses)"], ["degree", "الدرجة", "Degree"], ["site", "اسم الموقع", "Website name"]],
};

function SourceForm({ initial, onClose, onSaved }: { initial?: Source | null; onClose: () => void; onSaved: () => void }) {
  const { lang } = useI18n();
  const toast = useToast();
  const ar = lang === "ar";
  const [s, setS] = useState<any>(initial || { source_type: "article", title: "", authors: [{ given: "", family: "" }], year: "", doi: "", isbn: "", data: {} });
  const save = async () => {
    const body = { ...s, authors: s.authors.filter((a: any) => a.family || a.given) };
    try { initial ? await api.updateSource(initial.id, body) : await api.createSource(body); onSaved(); onClose(); } catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <Dialog open onClose={onClose} title={initial ? (ar ? "تعديل مصدر" : "Edit source") : (ar ? "إضافة مصدر" : "Add source")} wide
      footer={<Button disabled={!s.title.trim()} onClick={save}>{ar ? "حفظ" : "Save"}</Button>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={ar ? "النوع" : "Type"}><Select value={s.source_type} onChange={(e) => setS({ ...s, source_type: e.target.value })}>{TYPES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
        <Field label={ar ? "السنة" : "Year"}><Input value={s.year} onChange={(e) => setS({ ...s, year: e.target.value })} /></Field>
        <div className="md:col-span-2"><Field label={ar ? "العنوان" : "Title"}><Input dir="auto" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field></div>
        <div className="space-y-1 md:col-span-2">
          <div className="text-sm font-medium">{ar ? "المؤلفون" : "Authors"}</div>
          {s.authors.map((a: any, i: number) => (
            <div key={i} className="flex gap-2">
              <Input placeholder={ar ? "اسم العائلة" : "Family"} value={a.family} onChange={(e) => setS({ ...s, authors: s.authors.map((x: any, j: number) => (j === i ? { ...x, family: e.target.value } : x)) })} />
              <Input placeholder={ar ? "الاسم الأول" : "Given"} value={a.given} onChange={(e) => setS({ ...s, authors: s.authors.map((x: any, j: number) => (j === i ? { ...x, given: e.target.value } : x)) })} />
              <IconButton label="remove" onClick={() => setS({ ...s, authors: s.authors.filter((_: any, j: number) => j !== i) })}><Trash2 className="h-4 w-4" /></IconButton>
            </div>))}
          <Button size="sm" variant="secondary" onClick={() => setS({ ...s, authors: [...s.authors, { given: "", family: "" }] })}>+ {ar ? "مؤلف" : "Author"}</Button>
        </div>
        <Field label="DOI"><Input dir="ltr" value={s.doi} onChange={(e) => setS({ ...s, doi: e.target.value })} placeholder="10.xxxx/…" /></Field>
        <Field label="ISBN"><Input dir="ltr" value={s.isbn} onChange={(e) => setS({ ...s, isbn: e.target.value })} /></Field>
        {DATA_FIELDS.common.map(([k, a, e]) => <Field key={k} label={ar ? a : e}><Input dir="auto" value={s.data[k] || ""} onChange={(ev) => setS({ ...s, data: { ...s.data, [k]: ev.target.value } })} /></Field>)}
      </div>
    </Dialog>
  );
}

export default function ReferencesPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const ar = lang === "ar";
  const [q, setQ] = useState("");
  const { data, loading, reload } = useAsync(() => api.sources(q), [q]);
  const [style, setStyle] = useState("apa");
  const fmt = useAsync(() => (data?.length ? api.formatSources(data.map((s) => s.id), style) : Promise.resolve({ entries: [] })), [data, style]);
  const [form, setForm] = useState<{ open: boolean; s: Source | null }>({ open: false, s: null });
  const [imp, setImp] = useState<{ format: "bibtex" | "ris"; text: string } | null>(null);
  const [del, setDel] = useState<Source | null>(null);
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("references")}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<FileUp className="h-4 w-4" />} onClick={() => setImp({ format: "bibtex", text: "" })}>BibTeX / RIS</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ open: true, s: null })}>{ar ? "إضافة مصدر" : "Add source"}</Button>
        </div>
      </div>
      <Card className="flex gap-3">
        <Input placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select className="w-44" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="style">
          {["apa", "ieee", "mla", "chicago", "harvard", "vancouver"].map((s) => <option key={s} value={s}>{s === "apa" ? "APA 7" : s.toUpperCase()}</option>)}</Select>
      </Card>
      <Card>
        {loading ? <Spinner /> : !data?.length ? <p className="py-8 text-center text-slate-500">{t("none")}</p> : (
          <div className="divide-y dark:divide-navy-700">
            {data.map((s) => {
              const e = fmt.data?.entries.find((x) => x.id === s.id);
              return (
                <div key={s.id} className="flex items-start gap-3 py-3">
                  <Badge>{s.source_type}</Badge>
                  <div className="min-w-0 flex-1" dir="auto">
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: (e?.text || s.title).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!)).replace(/\*([^*]+)\*/g, "<em>$1</em>") }} />
                    {e && <div className="mt-0.5 text-xs text-slate-500">{ar ? "داخل النص:" : "In-text:"} {e.in_text}</div>}
                  </div>
                  <IconButton label={t("edit")} onClick={() => setForm({ open: true, s })}><Pencil className="h-4 w-4" /></IconButton>
                  <IconButton label={t("delete")} onClick={() => setDel(s)}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
                </div>);
            })}
          </div>)}
      </Card>
      {form.open && <SourceForm initial={form.s} onClose={() => setForm({ open: false, s: null })} onSaved={reload} />}
      <Dialog open={!!imp} onClose={() => setImp(null)} title={ar ? "استيراد مراجع" : "Import references"} wide
        footer={<Button disabled={!imp?.text.trim()} onClick={async () => { try { const r = await api.importSources(imp!.format, imp!.text); toast("success", `${r.length} ✓`); setImp(null); reload(); } catch (e) { toast("error", errorMessage(e)); } }}>{ar ? "استيراد" : "Import"}</Button>}>
        {imp && <div className="space-y-3">
          <Select value={imp.format} onChange={(e) => setImp({ ...imp, format: e.target.value as any })}><option value="bibtex">BibTeX (.bib)</option><option value="ris">RIS (.ris)</option></Select>
          <input type="file" accept=".bib,.ris,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImp({ format: f.name.endsWith(".ris") ? "ris" : "bibtex", text: await f.text() }); }} />
          <Textarea dir="ltr" rows={12} className="font-mono text-xs" value={imp.text} onChange={(e) => setImp({ ...imp, text: e.target.value })} placeholder="@article{key, author = {...}, title = {...}, year = {...}}" />
        </div>}
      </Dialog>
      <Confirm open={!!del} text={t("confirmDelete")} confirmLabel={t("delete")} cancelLabel={t("cancel")} onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.deleteSource(del!.id); reload(); } catch (e) { toast("error", errorMessage(e)); } }} />
    </div>
  );
}
