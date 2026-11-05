import { useNavigate } from "react-router-dom";
import { Bell, Bot, CheckCircle2, Clock, FileText, FolderKanban, LayoutTemplate, Plus, Star } from "lucide-react";
import { Button, Card, EmptyState, Spinner } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api } from "../lib/api";
import { fmtDate, useAsync } from "../lib/useAsync";
import { useAuth } from "../lib/auth";
import DocList from "../components/DocList";

const actionLabel: Record<string, [string, string]> = {
  "document.create": ["أنشئ تقرير", "Report created"], "document.delete": ["حُذف تقرير", "Report deleted"],
  "project.create": ["أنشئ مشروع", "Project created"], "project.update": ["عُدّل مشروع", "Project updated"],
  "asset.upload": ["رُفع ملف", "File uploaded"], "auth.login": ["تسجيل دخول", "Signed in"], "auth.register": ["إنشاء الحساب", "Account created"],
  "ai.provider_saved": ["حُفظ مزود ذكاء اصطناعي", "AI provider saved"], "workspace.member_set": ["تحديث عضو", "Member updated"],
};

export default function Dashboard() {
  const { t, lang } = useI18n();
  const { user, offline } = useAuth();
  const nav = useNavigate();
  const { data, loading, error, reload } = useAsync(() => api.dashboard(), []);
  if (loading) return <Spinner />;
  if (error) return <Card><p className="text-danger">{error}</p>{offline && <p className="mt-2 text-sm">{t("offline")}</p>}</Card>;
  const stats = [
    { label: t("totalReports"), value: data.total_reports, icon: FileText, color: "text-primary-500" },
    { label: t("completed"), value: data.completed, icon: CheckCircle2, color: "text-success" },
    { label: t("inProgress"), value: data.in_progress, icon: Clock, color: "text-warning" },
    { label: t("projects"), value: data.projects, icon: FolderKanban, color: "text-info" },
    { label: t("aiRequests"), value: data.ai_requests_30d, icon: Bot, color: "text-ai-500" },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{lang === "ar" ? `مرحباً، ${user?.full_name || ""}` : `Welcome, ${user?.full_name || ""}`}</h1>
          <p className="text-sm text-slate-500">{data.workspace.name}</p>
        </div>
        <Button onClick={() => nav("/new")} icon={<Plus className="h-4 w-4" />}>{t("newReport")}</Button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="flex items-center gap-3">
            <s.icon className={`h-8 w-8 ${s.color}`} />
            <div><div className="text-2xl font-bold" data-testid={`stat-${s.label}`}>{s.value}</div><div className="text-xs text-slate-500">{s.label}</div></div>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">{t("recentReports")}</h2>
          <DocList docs={data.recent} onChange={reload} />
        </Card>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><Star className="h-4 w-4 text-amber-400" />{t("favorites")}</h2>
            {data.favorites.length === 0 ? <p className="text-sm text-slate-500">{t("none")}</p> :
              data.favorites.map((d: any) => <button key={d.id} onClick={() => nav(`/editor/${d.id}`)} className="block w-full truncate py-1 text-start text-sm hover:text-primary-600">{d.title}</button>)}
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><LayoutTemplate className="h-4 w-4" />{t("recentTemplates")}</h2>
            {data.recent_templates.length === 0 ? <p className="text-sm text-slate-500">{t("none")}</p> :
              data.recent_templates.map((x: any) => <button key={x.id} onClick={() => nav(`/new?template=${x.id}`)} className="block w-full truncate py-1 text-start text-sm hover:text-primary-600">{lang === "ar" ? x.name_ar || x.name : x.name}</button>)}
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><Bell className="h-4 w-4" />{t("notifications")}</h2>
            {data.notifications.length === 0 ? <EmptyState title={t("none")} /> : data.notifications.map((n: any, i: number) => (
              <div key={i} className="flex justify-between gap-2 border-b border-slate-100 py-1.5 text-sm last:border-0 dark:border-navy-700">
                <span>{actionLabel[n.action]?.[lang === "ar" ? 0 : 1] ?? n.action}{n.details?.title || n.details?.filename ? `: ${n.details.title || n.details.filename}` : ""}</span>
                <span className="shrink-0 text-xs text-slate-500">{fmtDate(n.created_at, lang)}</span>
              </div>))}
          </Card>
        </div>
      </div>
    </div>
  );
}
