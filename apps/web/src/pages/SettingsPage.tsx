import { useState } from "react";
import { CheckCircle2, Plug, Plus, Star, Trash2, XCircle } from "lucide-react";
import type { Provider } from "@rsp/shared-types";
import { Badge, Button, Card, Dialog, Field, IconButton, Input, Select, Spinner, Tabs, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { api, apiBase, errorMessage } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { sync, useSyncState } from "../lib/sync";
import { deviceId } from "../lib/offline";

const PRESETS: Record<string, { base_url: string; model: string; embedding_model: string }> = {
  openai: { base_url: "https://api.openai.com/v1", model: "gpt-4o-mini", embedding_model: "text-embedding-3-small" },
  ollama: { base_url: "http://localhost:11434", model: "llama3.1", embedding_model: "nomic-embed-text" },
  anthropic: { base_url: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5", embedding_model: "" },
  openai_compatible: { base_url: "http://localhost:1234/v1", model: "", embedding_model: "" },
};

function ProviderForm({ initial, onClose, onSaved }: { initial: Partial<Provider> | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [p, setP] = useState<any>({ name: "", type: "openai", ...PRESETS.openai, api_key: "", is_default: false, monthly_token_limit: 0, ...initial });
  const save = async () => {
    const body = { ...p, api_key: p.api_key ? p.api_key : initial?.id ? null : "" };
    try { await api.saveProvider(body); onSaved(); onClose(); } catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <Dialog open onClose={onClose} title={t("aiProviders")} footer={<Button onClick={save} disabled={!p.name}>{t("save")}</Button>}>
      <div className="space-y-3">
        <Field label={t("name")}><Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="OpenAI / Ollama local" /></Field>
        <Field label="Type"><Select value={p.type} onChange={(e) => setP({ ...p, type: e.target.value, ...(initial?.id ? {} : PRESETS[e.target.value]) })}>
          <option value="openai">OpenAI API</option><option value="ollama">Ollama (local)</option><option value="anthropic">Anthropic</option><option value="openai_compatible">OpenAI-compatible (LM Studio, vLLM, OpenRouter…)</option></Select></Field>
        <Field label={t("baseUrl")}><Input dir="ltr" value={p.base_url} onChange={(e) => setP({ ...p, base_url: e.target.value })} /></Field>
        {p.type !== "ollama" && <Field label={t("apiKey")} hint={initial?.has_api_key ? t("keyStored") : undefined}>
          <Input dir="ltr" type="password" autoComplete="off" value={p.api_key} onChange={(e) => setP({ ...p, api_key: e.target.value })} placeholder={initial?.has_api_key ? "••••••••" : "sk-…"} /></Field>}
        <Field label={t("model")}><Input dir="ltr" value={p.model} onChange={(e) => setP({ ...p, model: e.target.value })} /></Field>
        <Field label={t("embeddingModel")}><Input dir="ltr" value={p.embedding_model} onChange={(e) => setP({ ...p, embedding_model: e.target.value })} /></Field>
        <Field label={t("monthlyLimit")}><Input type="number" min={0} value={p.monthly_token_limit} onChange={(e) => setP({ ...p, monthly_token_limit: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.is_default} onChange={(e) => setP({ ...p, is_default: e.target.checked })} />{t("setDefault")}</label>
      </div>
    </Dialog>
  );
}

function AIProviders() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading, reload } = useAsync(() => api.providers(), []);
  const usage = useAsync(() => api.aiUsage(), []);
  const [form, setForm] = useState<Partial<Provider> | null | false>(false);
  const [tests, setTests] = useState<Record<string, any>>({});
  const [limit, setLimit] = useState<string>("");
  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-between"><h2 className="font-semibold">{t("aiProviders")}</h2><Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setForm(null)}>{t("addProvider")}</Button></div>
      {data!.length === 0 && <p className="text-sm text-slate-500">{t("none")}</p>}
      {data!.map((p) => (
        <Card key={p.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <b>{p.name}</b><Badge color="blue">{p.type}</Badge>{p.is_default && <Badge color="green">{t("setDefault")}</Badge>}
            <span className="text-xs text-slate-500" dir="ltr">{p.base_url} · {p.model}</span>
            <div className="flex-1" />
            <Button size="sm" variant="secondary" icon={<Plug className="h-4 w-4" />} onClick={async () => setTests({ ...tests, [p.id]: await api.testProvider(p.id).catch((e) => ({ ok: false, error: errorMessage(e) })) })}>{t("testConnection")}</Button>
            {!p.is_default && <IconButton label={t("setDefault")} onClick={async () => { await api.saveProvider({ ...p, api_key: null, is_default: true }); reload(); }}><Star className="h-4 w-4" /></IconButton>}
            <Button size="sm" variant="ghost" onClick={() => setForm(p)}>{t("edit")}</Button>
            <IconButton label={t("delete")} onClick={async () => { try { await api.deleteProvider(p.id); reload(); } catch (e) { toast("error", errorMessage(e)); } }}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
          </div>
          {tests[p.id] && (tests[p.id].ok
            ? <p className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" />OK — {tests[p.id].models?.length} models{tests[p.id].model_available === false ? ` (⚠ "${p.model}" not found)` : ""}</p>
            : <p className="flex items-center gap-1 text-sm text-danger"><XCircle className="h-4 w-4" />{tests[p.id].error}</p>)}
        </Card>))}
      <h2 className="pt-4 font-semibold">{t("usage")}</h2>
      {usage.data && <Card className="space-y-2 text-sm">
        <div>{usage.data.period}: <b>{usage.data.tokens_this_month.toLocaleString()}</b> tokens{usage.data.monthly_limit ? ` / ${usage.data.monthly_limit.toLocaleString()}` : ""} · errors: {usage.data.errors}</div>
        <table className="w-full text-xs"><thead><tr className="text-start text-slate-500"><th className="text-start">Provider</th><th className="text-start">Action</th><th>Requests</th><th>Prompt</th><th>Completion</th></tr></thead>
          <tbody>{usage.data.breakdown.map((r: any, i: number) => <tr key={i} className="border-t dark:border-navy-700"><td>{r.provider}</td><td>{r.action}</td><td className="text-center">{r.requests}</td><td className="text-center">{r.prompt_tokens}</td><td className="text-center">{r.completion_tokens}</td></tr>)}</tbody></table>
        <div className="flex items-end gap-2 pt-2"><Field label={t("monthlyLimit")}><Input type="number" min={0} value={limit} placeholder={String(usage.data.monthly_limit)} onChange={(e) => setLimit(e.target.value)} /></Field>
          <Button size="sm" onClick={async () => { try { await api.setAiLimit(+limit || 0); usage.reload(); } catch (e) { toast("error", errorMessage(e)); } }}>{t("save")}</Button></div>
      </Card>}
      {form !== false && <ProviderForm initial={form} onClose={() => setForm(false)} onSaved={reload} />}
    </div>
  );
}

function Members() {
  const { t } = useI18n();
  const { workspace } = useAuth();
  const toast = useToast();
  const { data, reload } = useAsync(() => api.members(workspace!.id), [workspace?.id]);
  const [email, setEmail] = useState(""), [role, setRole] = useState("editor");
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">{t("members")} — {workspace?.name}</h2>
      <div className="flex gap-2"><Input type="email" dir="ltr" placeholder={t("email")} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Select className="w-32" value={role} onChange={(e) => setRole(e.target.value)}><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></Select>
        <Button onClick={async () => { try { await api.addMember(workspace!.id, email, role); setEmail(""); reload(); } catch (e) { toast("error", errorMessage(e)); } }}>{t("create")}</Button></div>
      {data?.map((m) => (
        <div key={m.user_id} className="flex items-center gap-2 border-b py-2 text-sm dark:border-navy-700">
          <span className="flex-1">{m.full_name} <span className="text-slate-500" dir="ltr">{m.email}</span></span><Badge>{m.role}</Badge>
          {m.role !== "owner" && <IconButton label={t("delete")} onClick={async () => { try { await api.removeMember(workspace!.id, m.user_id); reload(); } catch (e) { toast("error", errorMessage(e)); } }}><Trash2 className="h-4 w-4 text-danger" /></IconButton>}
        </div>))}
    </div>
  );
}

function Account() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name || "");
  const [pw, setPw] = useState({ current: "", next: "" });
  return (
    <div className="max-w-lg space-y-4">
      <Field label={t("fullName")}><div className="flex gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={async () => { await api.updateMe({ full_name: name, locale: lang } as any); refresh(); toast("success", t("saved")); }}>{t("save")}</Button></div></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("language")}><Select value={lang} onChange={(e) => setLang(e.target.value as any)}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
        <Field label={t("appearance")}><Select value={theme} onChange={(e) => setTheme(e.target.value as any)}><option value="dark">{t("dark")}</option><option value="light">{t("light")}</option></Select></Field>
      </div>
      <h3 className="pt-2 font-semibold">{t("password")}</h3>
      <Input type="password" placeholder={lang === "ar" ? "كلمة المرور الحالية" : "Current password"} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
      <Input type="password" placeholder={lang === "ar" ? "كلمة المرور الجديدة" : "New password"} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
      <Button variant="secondary" onClick={async () => { try { await api.changePassword(pw.current, pw.next); toast("success", t("saved")); logout(); } catch (e) { toast("error", errorMessage(e)); } }}>{t("save")}</Button>
      <Button variant="danger" onClick={async () => { await api.logoutAll(); logout(); }}>{lang === "ar" ? "تسجيل الخروج من كل الأجهزة" : "Sign out of all devices"}</Button>
    </div>
  );
}

function SyncSettings() {
  const { t, lang } = useI18n();
  const s = useSyncState();
  const toast = useToast();
  return (
    <div className="max-w-lg space-y-3 text-sm">
      <p>{t("serverUrl")}: <code dir="ltr">{apiBase()}</code></p>
      <p>Device: <code dir="ltr">{deviceId()}</code></p>
      <p>{s.online ? t("online") : t("offline")} · {s.pending} {t("pendingSync")} · {s.conflicts.length} {t("conflict")}</p>
      <Button onClick={async () => { try { await sync.flush(); await sync.pull(); toast("success", "✓"); } catch (e) { toast("error", errorMessage(e)); } }}>{t("syncNow")}</Button>
      <p className="text-slate-500">{lang === "ar" ? "تُحفظ التعديلات محلياً عند انقطاع الاتصال وتُرسل تلقائياً عند عودته. لا يُستبدل أي إصدار أحدث على الخادم دون موافقتك."
        : "Edits are saved locally while offline and sent automatically when back online. A newer server version is never overwritten without your choice."}</p>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"account" | "ai" | "members" | "sync">("account");
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">{t("settings")}</h1>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "account", label: t("account") }, { id: "ai", label: t("aiProviders") }, { id: "members", label: t("members") }, { id: "sync", label: t("sync") }]} />
      <Card>{tab === "account" ? <Account /> : tab === "ai" ? <AIProviders /> : tab === "members" ? <Members /> : <SyncSettings />}</Card>
    </div>
  );
}
