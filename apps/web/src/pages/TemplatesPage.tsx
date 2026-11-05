import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import type { TemplateDef } from "@rsp/shared-types";
import { normalizeLayout } from "@rsp/document-schema";
import { Badge, Button, Card, Confirm, Dialog, Field, IconButton, Input, Select, Spinner, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { REPORT_TYPES } from "./NewReportWizard";

/** Template Designer: colors, fonts, headings, margins, page numbers, header/footer, table & caption & reference styles, sections. */
function Designer({ initial, onClose, onSaved }: { initial: TemplateDef; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [tpl, setTpl] = useState<TemplateDef>(() => JSON.parse(JSON.stringify(initial)));
  const lay = normalizeLayout(tpl.layout as any);
  const setLay = (p: Record<string, any>) => setTpl({ ...tpl, layout: { ...tpl.layout, ...p } });
  const setStyle = (k: string, p: Record<string, any>) => setTpl({ ...tpl, styles: { ...tpl.styles, [k]: { ...(tpl.styles[k] || {}), ...p } } });
  const save = async () => {
    const body = { name: tpl.name, name_ar: tpl.name_ar, category: tpl.category, structure: tpl.structure, layout: { ...tpl.layout, headingColor: tpl.styles.heading1?.color || lay.headingColor }, styles: tpl.styles };
    try { initial.id && !initial.is_builtin ? await api.updateTemplate(initial.id, body) : await api.createTemplate(body); onSaved(); onClose(); }
    catch (e) { toast("error", errorMessage(e)); }
  };
  const ar = lang === "ar";
  return (
    <Dialog open onClose={onClose} title={ar ? "مصمم القوالب" : "Template designer"} wide="xl" footer={<><Button variant="secondary" onClick={onClose}>{t("cancel")}</Button><Button onClick={save}>{t("save")}</Button></>}>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label={ar ? "الاسم (إنجليزي)" : "Name (English)"}><Input value={tpl.name} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} /></Field>
            <Field label={ar ? "الاسم (عربي)" : "Name (Arabic)"}><Input value={tpl.name_ar} onChange={(e) => setTpl({ ...tpl, name_ar: e.target.value })} /></Field>
            <Field label={t("category")}><Select value={tpl.category} onChange={(e) => setTpl({ ...tpl, category: e.target.value })}>{[...REPORT_TYPES, "custom"].map((c) => <option key={c} value={c}>{t("t_" + c)}</option>)}</Select></Field>
            <Field label={ar ? "الخط" : "Font"}><Select value={lay.fontFamily} onChange={(e) => setLay({ fontFamily: e.target.value })}>{["Amiri", "Cairo", "Noto Naskh Arabic", "Noto Sans Arabic", "Arial", "Times New Roman"].map((f) => <option key={f}>{f}</option>)}</Select></Field>
            <Field label={ar ? "حجم الخط" : "Font size"}><Input type="number" value={lay.fontSize} onChange={(e) => setLay({ fontSize: +e.target.value })} /></Field>
            <Field label={ar ? "تباعد الأسطر" : "Line spacing"}><Input type="number" step={0.05} value={lay.lineHeight} onChange={(e) => setLay({ lineHeight: +e.target.value })} /></Field>
            <Field label={ar ? "لون العناوين" : "Heading color"}><Input type="color" value={tpl.styles.heading1?.color || lay.headingColor} onChange={(e) => { setStyle("heading1", { color: e.target.value }); setStyle("heading2", { color: e.target.value }); setLay({ headingColor: e.target.value }); }} /></Field>
            <Field label={ar ? "لون الغلاف" : "Cover accent"}><Input type="color" value={tpl.styles.cover?.accent || lay.headingColor} onChange={(e) => setStyle("cover", { accent: e.target.value })} /></Field>
            <Field label={ar ? "رأس الجداول" : "Table header color"}><Input type="color" value={tpl.styles.table?.headerBg || "#dbeafe"} onChange={(e) => setStyle("table", { headerBg: e.target.value })} /></Field>
            <Field label={ar ? "نمط المراجع" : "Citation style"}><Select value={(tpl.layout as any).citationStyle || "apa"} onChange={(e) => { setLay({ citationStyle: e.target.value }); setStyle("references", { style: e.target.value }); }}>
              {["apa", "ieee", "mla", "chicago", "harvard", "vancouver"].map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}</Select></Field>
            <Field label={ar ? "الهوامش (مم)" : "Margins (mm)"}><Input type="number" value={lay.margins_mm.top} onChange={(e) => setLay({ margins_mm: { top: +e.target.value, bottom: +e.target.value, left: +e.target.value, right: +e.target.value } })} /></Field>
            <Field label={ar ? "الترويسة" : "Header"}><Input value={lay.header.text} onChange={(e) => setLay({ header: { ...lay.header, text: e.target.value } })} /></Field>
            <Field label={ar ? "التذييل" : "Footer"}><Input value={lay.footer.text} onChange={(e) => setLay({ footer: { ...lay.footer, text: e.target.value } })} /></Field>
            <Field label={ar ? "ترقيم الصفحات" : "Page numbers"}><Select value={lay.pageNumbers.enabled ? lay.pageNumbers.align : "off"} onChange={(e) => setLay({ pageNumbers: { ...lay.pageNumbers, enabled: e.target.value !== "off", align: e.target.value === "off" ? "center" : e.target.value } })}>
              <option value="off">—</option><option value="center">center</option><option value="right">right</option><option value="left">left</option></Select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!(tpl.layout as any).includeToc} onChange={(e) => setLay({ includeToc: e.target.checked })} />{ar ? "جدول محتويات" : "Table of contents"}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(tpl.layout as any).includeBibliography !== false} onChange={(e) => setLay({ includeBibliography: e.target.checked })} />{ar ? "قائمة مراجع" : "Bibliography"}</label>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">{ar ? "الأقسام (عربي | إنجليزي)" : "Sections (Arabic | English)"}</div>
            {tpl.structure.map((s, i) => (
              <div key={i} className="mb-1 flex gap-2">
                <Input value={s.ar} onChange={(e) => setTpl({ ...tpl, structure: tpl.structure.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x)) })} />
                <Input dir="ltr" value={s.en} onChange={(e) => setTpl({ ...tpl, structure: tpl.structure.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) })} />
                <IconButton label={t("delete")} onClick={() => setTpl({ ...tpl, structure: tpl.structure.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
              </div>))}
            <Button size="sm" variant="secondary" onClick={() => setTpl({ ...tpl, structure: [...tpl.structure, { ar: "", en: "" }] })}>{t("addSection")}</Button>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4 text-black shadow-page" style={{ fontFamily: lay.fontFamily, fontSize: lay.fontSize * 0.8, lineHeight: lay.lineHeight }} dir={ar ? "rtl" : "ltr"}>
          <div className="mb-2 text-center text-xs text-slate-400">{lay.header.text.replace("{title}", ar ? "عنوان التقرير" : "Report title")}</div>
          <div className="mb-3 h-1.5 rounded" style={{ background: tpl.styles.cover?.accent || lay.headingColor }} />
          <h3 className="text-lg font-bold" style={{ color: tpl.styles.heading1?.color || lay.headingColor }}>{tpl.structure[0]?.[ar ? "ar" : "en"] || "—"}</h3>
          <p className="text-sm">{ar ? "نص تجريبي لمعاينة الخط والتباعد في هذا القالب." : "Sample text previewing font and spacing."}</p>
          <table className="my-2 w-full border-collapse text-xs"><tbody><tr>{[1, 2].map((x) => <th key={x} className="border border-slate-400 p-1" style={{ background: tpl.styles.table?.headerBg || "#dbeafe" }}>H{x}</th>)}</tr>
            <tr>{[1, 2].map((x) => <td key={x} className="border border-slate-400 p-1">{x * 10}</td>)}</tr></tbody></table>
          {lay.pageNumbers.enabled && <div className="mt-6 text-xs text-slate-400" style={{ textAlign: lay.pageNumbers.align as any }}>1</div>}
        </div>
      </div>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.templates(), []);
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<TemplateDef | null>(null);
  const [del, setDel] = useState<TemplateDef | null>(null);
  const ar = lang === "ar";
  if (loading) return <Spinner />;
  const list = (data || []).filter((x) => !cat || x.category === cat);
  const blank: TemplateDef = { slug: "", category: "custom", name: "My template", name_ar: "قالبي", structure: [{ ar: "المقدمة", en: "Introduction" }, { ar: "الخاتمة", en: "Conclusion" }],
    layout: { ...normalizeLayout(null), includeToc: true, includeBibliography: true } as any, styles: {} };
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("templates")}</h1>
        <div className="flex gap-2">
          <Select className="w-48" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">{t("category")}: *</option>{[...REPORT_TYPES, "custom"].map((c) => <option key={c} value={c}>{t("t_" + c)}</option>)}</Select>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit(blank)}>{ar ? "قالب جديد" : "New template"}</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((x) => (
          <Card key={x.id} className="flex flex-col overflow-hidden p-0">
            <div className="flex h-28 flex-col items-center justify-center gap-1 text-white" style={{ background: `linear-gradient(135deg, ${(x.layout as any).headingColor}, #0f172a)` }}>
              <div className="text-lg font-bold" style={{ fontFamily: (x.layout as any).fontFamily }}>{ar ? x.name_ar || x.name : x.name}</div>
              <div className="text-xs opacity-80">{(x.layout as any).fontFamily} · {((x.layout as any).citationStyle || "apa").toUpperCase()}</div>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="flex gap-1">{x.is_builtin ? <Badge color="blue">{ar ? "مدمج" : "Built-in"}</Badge> : <Badge color="violet">{ar ? "مخصص" : "Custom"}</Badge>}<Badge>{t("t_" + x.category)}</Badge></div>
              <p className="line-clamp-3 text-xs text-slate-500">{x.structure.map((s) => (ar ? s.ar : s.en)).join(" · ")}</p>
              <div className="mt-auto flex gap-1">
                <Button size="sm" onClick={() => nav(`/new?template=${x.id}`)}>{ar ? "استخدام" : "Use"}</Button>
                {x.is_builtin ? <IconButton label={t("duplicate")} onClick={() => setEdit({ ...x, id: undefined, is_builtin: false, name: x.name + " (copy)", name_ar: (x.name_ar || "") + " (نسخة)" })}><Copy className="h-4 w-4" /></IconButton>
                  : <><IconButton label={t("edit")} onClick={() => setEdit(x)}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton label={t("delete")} onClick={() => setDel(x)}><Trash2 className="h-4 w-4 text-danger" /></IconButton></>}
              </div>
            </div>
          </Card>))}
      </div>
      {edit && <Designer initial={edit} onClose={() => setEdit(null)} onSaved={reload} />}
      <Confirm open={!!del} text={t("confirmDelete")} confirmLabel={t("delete")} cancelLabel={t("cancel")} onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.deleteTemplate(del!.id!); reload(); } catch (e) { toast("error", errorMessage(e)); } }} />
    </div>
  );
}
