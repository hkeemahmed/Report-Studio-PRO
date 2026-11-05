import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Sparkles, Trash2 } from "lucide-react";
import type { TemplateDef } from "@rsp/shared-types";
import { buildDocumentFromTemplate } from "@rsp/template-engine";
import { normalizeLayout } from "@rsp/document-schema";
import { Button, Card, cx, Field, IconButton, Input, Select, Spinner, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { api, errorMessage, NetworkError } from "../lib/api";
import { sync } from "../lib/sync";
import { useAsync } from "../lib/useAsync";

export const REPORT_TYPES = ["academic", "scientific", "engineering", "medical", "technical", "cybersecurity", "business", "financial",
  "school", "research", "graduation", "laboratory"];

export default function NewReportWizard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState({ title: "", author: user?.full_name || "", university: "", department: "", stage: "", supervisor: "",
    date: new Date().toISOString().slice(0, 10), language: lang as "ar" | "en", project_id: sp.get("project") || "" });
  const [type, setType] = useState("academic");
  const tpls = useAsync(() => api.templates(), []);
  const projects = useAsync(() => api.projects(), []);
  const [tplId, setTplId] = useState<string>(sp.get("template") || "");
  const [pages, setPages] = useState(10);
  const [sections, setSections] = useState<string[]>([]);
  const tpl: TemplateDef | undefined = useMemo(() => tpls.data?.find((x) => x.id === tplId), [tpls.data, tplId]);
  const shown = useMemo(() => (tpls.data || []).filter((x) => x.category === type || !x.is_builtin), [tpls.data, type]);

  useEffect(() => { if (!tplId && shown.length) setTplId(shown[0].id!); }, [shown, tplId]);
  useEffect(() => { if (tpl && tpl.is_builtin && tpl.category !== type) setType(tpl.category); }, [tpl]);
  useEffect(() => { if (tpl) setSections(tpl.structure.map((s) => (info.language === "en" ? s.en : s.ar))); }, [tpl, info.language]);

  const ar = lang === "ar";
  const steps = [t("reportInfo"), t("reportType"), t("chooseTemplate"), t("targetPages"), t("structure"), t("createOpen")];
  const canNext = step !== 1 || info.title.trim().length > 0;

  const suggestAI = async () => {
    setBusy(true);
    try {
      const r = await api.ai("generate", { action: "chapters", params: { title: info.title, report_type: type, language: info.language } });
      const heads = r.text.split("\n").map((l) => /^#\s+(.+)/.exec(l.trim())?.[1]).filter(Boolean) as string[];
      if (heads.length) setSections(heads); else toast("warning", ar ? "لم يُرجع النموذج عناوين صالحة" : "Model returned no headings");
    } catch (e) { toast("error", errorMessage(e)); } finally { setBusy(false); }
  };

  const create = async () => {
    if (!tpl) return;
    setBusy(true);
    const meta = { ...info, title: info.title.trim() };
    const content = buildDocumentFromTemplate(tpl as TemplateDef, meta, sections.filter((s) => s.trim()));
    const layout = { ...normalizeLayout(tpl.layout as any), direction: info.language === "ar" ? "rtl" : "ltr" };
    const body = { title: meta.title, report_type: type, language: info.language, template_id: tpl.id, project_id: info.project_id || null,
      metadata: { ...meta, targetPages: pages }, content, layout };
    try {
      const d = await api.createDocument(body);
      nav(`/editor/${d.id}`);
    } catch (e) {
      if (e instanceof NetworkError) {
        const d = await sync.createOffline({ ...body, template_id: null });
        toast("warning", t("offline"));
        nav(`/editor/${d.id}`);
      } else toast("error", errorMessage(e));
    } finally { setBusy(false); }
  };

  const set = (k: keyof typeof info) => (e: any) => setInfo({ ...info, [k]: e.target.value });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">{t("newReport")}</h1>
      <ol className="flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <li key={s} className={cx("flex items-center gap-2 rounded-full px-3 py-1 text-sm", i + 1 === step ? "bg-primary-600 text-white" :
            i + 1 < step ? "bg-primary-100 text-primary-700 dark:bg-primary-600/20 dark:text-primary-100" : "bg-slate-100 text-slate-500 dark:bg-navy-800")}>
            <span className="font-bold">{i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>{s}</li>))}
      </ol>
      <Card className="p-6">
        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><Field label={t("title") + " *"}><Input value={info.title} onChange={set("title")} autoFocus /></Field></div>
            <Field label={t("author")}><Input value={info.author} onChange={set("author")} /></Field>
            <Field label={t("university")}><Input value={info.university} onChange={set("university")} /></Field>
            <Field label={t("department")}><Input value={info.department} onChange={set("department")} /></Field>
            <Field label={t("stage")}><Input value={info.stage} onChange={set("stage")} /></Field>
            <Field label={t("supervisor")}><Input value={info.supervisor} onChange={set("supervisor")} /></Field>
            <Field label={t("date")}><Input type="date" value={info.date} onChange={set("date")} /></Field>
            <Field label={t("language")}><Select value={info.language} onChange={set("language")}><option value="ar">{t("arabic")}</option><option value="en">{t("english")}</option></Select></Field>
            <Field label={t("project")}><Select value={info.project_id} onChange={set("project_id")}>
              <option value="">{t("noProject")}</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>)}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {REPORT_TYPES.map((x) => (
              <button key={x} onClick={() => { setType(x); setTplId(""); }} className={cx("rounded-xl border-2 p-4 text-start transition",
                type === x ? "border-primary-500 bg-primary-50 dark:bg-primary-600/10" : "border-slate-200 hover:border-primary-300 dark:border-navy-700")}>
                <div className="font-semibold">{t("t_" + x)}</div></button>))}
          </div>)}
        {step === 3 && (tpls.loading ? <Spinner /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((x) => (
              <button key={x.id} onClick={() => setTplId(x.id!)} className={cx("overflow-hidden rounded-xl border-2 text-start transition",
                tplId === x.id ? "border-primary-500" : "border-slate-200 hover:border-primary-300 dark:border-navy-700")}>
                <div className="h-2" style={{ background: (x.layout as any).headingColor }} />
                <div className="p-4">
                  <div className="font-semibold">{ar ? x.name_ar || x.name : x.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{(x.layout as any).fontFamily} · {((x.layout as any).citationStyle || "apa").toUpperCase()} · {x.structure.length} {ar ? "أقسام" : "sections"}</div>
                  <div className="mt-2 line-clamp-2 text-xs text-slate-400">{x.structure.map((s) => (ar ? s.ar : s.en)).join(" · ")}</div>
                </div>
              </button>))}
          </div>))}
        {step === 4 && (
          <div className="max-w-sm space-y-2">
            <Field label={t("targetPages")} hint={t("pagesHint")}><Input type="number" min={1} max={500} value={pages} onChange={(e) => setPages(Math.max(1, +e.target.value))} /></Field>
          </div>)}
        {step === 5 && (
          <div className="space-y-2">
            {sections.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-center text-sm text-slate-500">{i + 1}</span>
                <Input value={s} onChange={(e) => setSections(sections.map((x, j) => (j === i ? e.target.value : x)))} />
                <IconButton label="up" disabled={i === 0} onClick={() => { const n = [...sections]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSections(n); }}><ArrowUp className="h-4 w-4" /></IconButton>
                <IconButton label="down" disabled={i === sections.length - 1} onClick={() => { const n = [...sections]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSections(n); }}><ArrowDown className="h-4 w-4" /></IconButton>
                <IconButton label={t("delete")} onClick={() => setSections(sections.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
              </div>))}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setSections([...sections, ""])}>{t("addSection")}</Button>
              <Button variant="ai" icon={<Sparkles className="h-4 w-4" />} loading={busy} onClick={suggestAI} disabled={!info.title}>{t("aiStructure")}</Button>
            </div>
          </div>)}
        {step === 6 && tpl && (
          <div className="space-y-2 text-sm">
            <p><b>{t("title")}:</b> {info.title}</p>
            <p><b>{t("reportType")}:</b> {t("t_" + type)} · <b>{t("chooseTemplate")}:</b> {ar ? tpl.name_ar : tpl.name}</p>
            <p><b>{t("targetPages")}:</b> {pages} · <b>{t("language")}:</b> {info.language === "ar" ? t("arabic") : t("english")}</p>
            <p><b>{t("structure")}:</b> {sections.filter(Boolean).join(" · ")}</p>
          </div>)}
      </Card>
      <div className="flex justify-between">
        <Button variant="secondary" disabled={step === 1} onClick={() => setStep(step - 1)}>{t("back")}</Button>
        {step < 6 ? <Button disabled={!canNext || (step === 3 && !tpl)} onClick={() => setStep(step + 1)}>{t("next")}</Button>
          : <Button loading={busy} onClick={create} data-testid="wizard-create">{t("createOpen")}</Button>}
      </div>
    </div>
  );
}
