import { useState } from "react";
import { Button, Card, Field, Input, Select } from "@rsp/ui-components";
import { Languages, Moon, Sun } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { api, apiBase, errorMessage } from "../lib/api";

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", server: apiBase() });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    localStorage.setItem("rsp.apiUrl", form.server.replace(/\/$/, ""));
    api.base = apiBase();
    try { mode === "login" ? await login(form.email, form.password) : await register(form.email, form.password, form.name, lang); }
    catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-[#1e1b4b] p-4">
      <div className="absolute end-4 top-4 flex gap-2">
        <Button variant="ghost" size="sm" className="text-white" onClick={() => setLang(lang === "ar" ? "en" : "ar")} icon={<Languages className="h-4 w-4" />}>{lang === "ar" ? "English" : "العربية"}</Button>
        <Button variant="ghost" size="sm" className="text-white" onClick={toggle} aria-label="theme">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
      </div>
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/favicon.svg" className="h-14 w-14" alt="" />
          <h1 className="text-2xl font-bold">Report Studio <span className="text-primary-500">PRO</span></h1>
          <p className="text-sm text-slate-500">{lang === "ar" ? "نظام احترافي لكتابة وإدارة التقارير بالذكاء الاصطناعي" : "Professional AI-powered report writing"}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && <Field label={t("fullName")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>}
          <Field label={t("email")}><Input type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" /></Field>
          <Field label={t("password")} hint={mode === "register" ? (lang === "ar" ? "8 أحرف على الأقل، تتضمن حروفاً وأرقاماً" : "Min 8 chars with letters and digits") : undefined}>
            <Input type="password" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
          <details className="text-sm"><summary className="cursor-pointer text-slate-500">{t("serverUrl")}</summary>
            <Input className="mt-2" dir="ltr" value={form.server} onChange={(e) => setForm({ ...form, server: e.target.value })} /></details>
          {err && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-danger dark:bg-red-950/40">{err}</p>}
          <Button type="submit" className="w-full" loading={busy}>{mode === "login" ? t("login") : t("register")}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "login" ? t("noAccount") : t("haveAccount")}{" "}
          <button className="font-medium text-primary-500 hover:underline" onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
            {mode === "login" ? t("register") : t("login")}</button>
        </p>
      </Card>
    </div>
  );
}
