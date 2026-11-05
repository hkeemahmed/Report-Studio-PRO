import type { AIResult, Asset, DiffResult, DocumentSummary, Folder, Project, Provider, ReportDocument, Source, TemplateDef,
  User, Version, Workspace } from "@rsp/shared-types";

export class ApiError extends Error {
  constructor(public status: number, public detail: any) {
    super(typeof detail === "string" ? detail : detail?.message || detail?.detail || `HTTP ${status}`);
  }
}
export class NetworkError extends Error {}

const TOKENS = "rsp.tokens";
type Tokens = { access_token: string; refresh_token: string };

export function apiBase(): string {
  // Desktop (Tauri): talk to the bundled local backend sidecar by default
  const desktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const fallback = desktop ? "http://127.0.0.1:8765" : (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";
  return (localStorage.getItem("rsp.apiUrl") || fallback).replace(/\/$/, "");
}

export class ApiClient {
  private refreshing: Promise<boolean> | null = null;
  onAuthLost: () => void = () => {};
  constructor(public base = apiBase()) {}

  get tokens(): Tokens | null { try { return JSON.parse(localStorage.getItem(TOKENS) || "null"); } catch { return null; } }
  set tokens(t: Tokens | null) { t ? localStorage.setItem(TOKENS, JSON.stringify(t)) : localStorage.removeItem(TOKENS); }

  private async refresh(): Promise<boolean> {
    const t = this.tokens;
    if (!t) return false;
    this.refreshing ??= fetch(this.base + "/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: t.refresh_token }) })
      .then(async (r) => { if (!r.ok) return false; this.tokens = await r.json(); return true; })
      .catch(() => false).finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const headers = new Headers(init.headers);
    const t = this.tokens;
    if (t) headers.set("Authorization", `Bearer ${t.access_token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    let r: Response;
    try { r = await fetch(this.base + path, { ...init, headers }); }
    catch { throw new NetworkError("Network unavailable"); }
    if (r.status === 401 && retry && t && !path.startsWith("/auth/login")) {
      if (await this.refresh()) return this.raw(path, init, false);
      this.tokens = null; this.onAuthLost();
    }
    if (!r.ok) {
      let detail: any = r.statusText;
      try { const j = await r.json(); detail = j.detail ?? j; } catch { /* non-json */ }
      throw new ApiError(r.status, detail);
    }
    return r;
  }

  async req<T>(path: string, method = "GET", body?: any): Promise<T> {
    const r = await this.raw(path, { method, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    if (r.status === 204) return undefined as T;
    return r.json();
  }

  // auth
  async login(email: string, password: string) { this.tokens = await this.req<Tokens>("/auth/login", "POST", { email, password }); }
  async register(email: string, password: string, full_name: string, locale: string) {
    this.tokens = await this.req<Tokens>("/auth/register", "POST", { email, password, full_name, locale });
  }
  logout() { this.tokens = null; }
  me = () => this.req<User>("/auth/me");
  updateMe = (b: Partial<User>) => this.req<User>("/auth/me", "PUT", b);
  changePassword = (current_password: string, new_password: string) => this.req("/auth/change-password", "POST", { current_password, new_password });
  logoutAll = () => this.req("/auth/logout-all", "POST");
  // workspaces
  workspaces = () => this.req<Workspace[]>("/workspaces");
  members = (ws: string) => this.req<any[]>(`/workspaces/${ws}/members`);
  addMember = (ws: string, email: string, role: string) => this.req(`/workspaces/${ws}/members`, "POST", { email, role });
  removeMember = (ws: string, uid: string) => this.req(`/workspaces/${ws}/members/${uid}`, "DELETE");
  dashboard = () => this.req<any>("/dashboard");
  // projects
  projects = (q = "", archived = false) => this.req<Project[]>(`/projects?q=${encodeURIComponent(q)}&archived=${archived}`);
  project = (id: string) => this.req<Project>(`/projects/${id}`);
  createProject = (b: Partial<Project>) => this.req<Project>("/projects", "POST", b);
  updateProject = (id: string, b: Partial<Project>) => this.req<Project>(`/projects/${id}`, "PUT", b);
  deleteProject = (id: string) => this.req(`/projects/${id}`, "DELETE");
  folders = (pid: string) => this.req<Folder[]>(`/projects/${pid}/folders`);
  createFolder = (project_id: string, name: string) => this.req<Folder>("/folders", "POST", { project_id, name });
  deleteFolder = (id: string) => this.req(`/folders/${id}`, "DELETE");
  // documents
  documents = (params: Record<string, string> = {}) => this.req<DocumentSummary[]>("/documents?" + new URLSearchParams(params));
  document = (id: string) => this.req<ReportDocument>(`/documents/${id}`);
  createDocument = (b: any) => this.req<ReportDocument>("/documents", "POST", b);
  updateDocument = (id: string, b: any) => this.req<ReportDocument>(`/documents/${id}`, "PUT", b);
  deleteDocument = (id: string) => this.req(`/documents/${id}`, "DELETE");
  duplicateDocument = (id: string) => this.req<ReportDocument>(`/documents/${id}/duplicate`, "POST");
  importDocument = (file: File) => { const f = new FormData(); f.append("file", file); return this.req<ReportDocument>("/documents/import", "POST", f); };
  versions = (id: string) => this.req<Version[]>(`/documents/${id}/versions`);
  version = (id: string, v: number) => this.req<Version & { content: any; layout: any }>(`/documents/${id}/versions/${v}`);
  restoreVersion = (id: string, v: number) => this.req<ReportDocument>(`/documents/${id}/versions/${v}/restore`, "POST");
  compareVersions = (id: string, a: number, b?: number) => this.req<DiffResult>(`/documents/${id}/compare?a=${a}${b ? `&b=${b}` : ""}`);
  compareDocs = (a: any, b: any) => this.req<DiffResult>("/review/compare", "POST", { a, b });
  setTags = (id: string, tags: string[]) => this.req<string[]>(`/documents/${id}/tags`, "PUT", { tags });
  comments = (id: string) => this.req<any[]>(`/documents/${id}/comments`);
  addComment = (id: string, body: string, anchor_text: string) => this.req<any>(`/documents/${id}/comments`, "POST", { body, anchor_text });
  resolveComment = (id: string, cid: string, resolved: boolean) => this.req<any>(`/documents/${id}/comments/${cid}?resolved=${resolved}`, "PUT");
  deleteComment = (id: string, cid: string) => this.req(`/documents/${id}/comments/${cid}`, "DELETE");
  similarity = (id: string) => this.req<any>(`/documents/${id}/similarity`);
  review = (id: string) => this.req<any>(`/documents/${id}/review`);
  // templates
  templates = () => this.req<TemplateDef[]>("/templates");
  createTemplate = (b: any) => this.req<TemplateDef>("/templates", "POST", b);
  updateTemplate = (id: string, b: any) => this.req<TemplateDef>(`/templates/${id}`, "PUT", b);
  deleteTemplate = (id: string) => this.req(`/templates/${id}`, "DELETE");
  // references
  sources = (q = "") => this.req<Source[]>(`/references?q=${encodeURIComponent(q)}`);
  createSource = (b: Partial<Source>) => this.req<Source>("/references", "POST", b);
  updateSource = (id: string, b: Partial<Source>) => this.req<Source>(`/references/${id}`, "PUT", b);
  deleteSource = (id: string) => this.req(`/references/${id}`, "DELETE");
  importSources = (format: "bibtex" | "ris", text: string) => this.req<Source[]>("/references/import", "POST", { format, text });
  formatSources = (source_ids: string[], style: string) => this.req<{ entries: { id: string; text: string; in_text: string }[] }>("/references/format", "POST", { source_ids, style });
  syncCitations = (docId: string) => this.req(`/references/documents/${docId}/citations/sync`, "POST");
  // assets
  assets = (kind = "") => this.req<Asset[]>(`/assets?kind=${kind}`);
  upload = (file: File, kind: "image" | "source", document_id?: string) => {
    const f = new FormData(); f.append("file", file); f.append("kind", kind); if (document_id) f.append("document_id", document_id);
    return this.req<Asset>("/assets", "POST", f);
  };
  assetText = (id: string) => this.req<{ text: string }>(`/assets/${id}/text`);
  deleteAsset = (id: string) => this.req(`/assets/${id}`, "DELETE");
  // AI
  providers = () => this.req<Provider[]>("/ai/providers");
  saveProvider = (b: any) => this.req<Provider>("/ai/providers", "POST", b);
  deleteProvider = (id: string) => this.req(`/ai/providers/${id}`, "DELETE");
  testProvider = (id: string) => this.req<{ ok: boolean; models?: string[]; error?: string; model_available?: boolean }>(`/ai/providers/${id}/test`, "POST");
  aiUsage = () => this.req<any>("/ai/usage");
  setAiLimit = (limit: number) => this.req(`/ai/usage/limit?limit=${limit}`, "PUT");
  ai = (endpoint: "generate" | "rewrite" | "analyze", body: any) => this.req<AIResult>(`/ai/${endpoint}`, "POST", body);
  research = (body: any) => this.req<AIResult>("/ai/research", "POST", body);
  embedSource = (id: string) => this.req(`/ai/sources/${id}/embed`, "POST");
  // exports
  async exportFile(fmt: string, document_id: string, content?: any, layout?: any): Promise<Blob> {
    const r = await this.raw(`/exports/${fmt}`, { method: "POST", body: JSON.stringify({ document_id, content, layout }) });
    return r.blob();
  }
  pageImages = (document_id: string, content?: any, layout?: any, scale = 0.6) =>
    this.req<{ count: number; pages: string[] }>(`/exports/pages?scale=${scale}`, "POST", { document_id, content, layout });
  // sync
  syncPush = (device_id: string, operations: any[]) => this.req<{ results: any[]; server_time: string }>("/sync/push", "POST", { device_id, operations });
  syncPull = (device_id: string, since?: string) => this.req<{ documents: ReportDocument[]; deleted: string[]; server_time: string }>("/sync/pull", "POST", { device_id, since });
}

export const api = new ApiClient();

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return "طلبات كثيرة، حاول بعد دقيقة / Too many requests — try again in a minute";
    if (e.status === 422 && e.detail?.errors) return e.detail.errors.map((x: any) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join("; ");
    return e.message;
  }
  if (e instanceof NetworkError) return "تعذر الاتصال بالخادم / Cannot reach server";
  return (e as Error)?.message || String(e);
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
