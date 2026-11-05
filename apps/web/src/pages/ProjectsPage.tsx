import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { Archive, ArchiveRestore, Folder, FolderKanban, FolderPlus, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { Project } from "@rsp/shared-types";
import { Badge, Button, Card, Confirm, Dialog, EmptyState, Field, IconButton, Input, Select, Spinner, Tabs, Textarea, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import DocList from "../components/DocList";

const CATS = ["academic", "scientific", "engineering", "medical", "technical", "cybersecurity", "business", "financial", "school", "research", "graduation", "laboratory"];

function ProjectForm({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Project | null; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name: initial?.name || "", description: initial?.description || "", category: initial?.category || "academic" });
  const save = async () => {
    try { initial ? await api.updateProject(initial.id, f) : await api.createProject(f); onSaved(); onClose(); }
    catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t("edit") : t("newProject")}
      footer={<><Button variant="secondary" onClick={onClose}>{t("cancel")}</Button><Button onClick={save} disabled={!f.name.trim()}>{t("save")}</Button></>}>
      <div className="space-y-3">
        <Field label={t("name")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t("description")}><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label={t("category")}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {CATS.map((c) => <option key={c} value={c}>{t("t_" + c)}</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}

function ProjectDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const p = useAsync(() => api.project(id), [id]);
  const folders = useAsync(() => api.folders(id), [id]);
  const [folder, setFolder] = useState<string>("");
  const docs = useAsync(() => api.documents(folder ? { project_id: id, folder_id: folder } : { project_id: id }), [id, folder]);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  if (p.loading) return <Spinner />;
  if (!p.data) return <p className="text-danger">{p.error}</p>;
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <button className="text-sm text-primary-500" onClick={() => nav("/projects")}>← {t("projects")}</button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-bold">{p.data.name}</h1><p className="text-sm text-slate-500">{p.data.description}</p></div>
        <Button onClick={() => nav(`/new?project=${id}`)} icon={<Plus className="h-4 w-4" />}>{t("newReport")}</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="space-y-1">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{t("folders")}</h2>
            <IconButton label={t("newFolder")} onClick={() => setNewFolder("")}><FolderPlus className="h-4 w-4" /></IconButton></div>
          <button onClick={() => setFolder("")} className={`block w-full rounded px-2 py-1 text-start text-sm ${!folder ? "bg-primary-50 dark:bg-primary-600/20" : ""}`}>*</button>
          {folders.data?.map((f) => (
            <div key={f.id} className={`group flex items-center rounded px-2 py-1 text-sm ${folder === f.id ? "bg-primary-50 dark:bg-primary-600/20" : ""}`}>
              <button className="flex flex-1 items-center gap-2 text-start" onClick={() => setFolder(f.id)}><Folder className="h-4 w-4" />{f.name}</button>
              <button className="hidden text-danger group-hover:block" aria-label={t("delete")} onClick={async () => { await api.deleteFolder(f.id); folders.reload(); setFolder(""); }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>))}
        </Card>
        <Card className="md:col-span-3">{docs.loading ? <Spinner /> : <DocList docs={docs.data || []} onChange={docs.reload} />}</Card>
      </div>
      <Dialog open={newFolder !== null} onClose={() => setNewFolder(null)} title={t("newFolder")}
        footer={<Button disabled={!newFolder?.trim()} onClick={async () => {
          try { await api.createFolder(id, newFolder!.trim()); setNewFolder(null); folders.reload(); } catch (e) { toast("error", errorMessage(e)); } }}>{t("create")}</Button>}>
        <Input value={newFolder || ""} onChange={(e) => setNewFolder(e.target.value)} />
      </Dialog>
    </div>
  );
}

export default function ProjectsPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const nav = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const { data, loading, reload } = useAsync(() => api.projects(q, tab === "archived"), [tab, q]);
  const [form, setForm] = useState<{ open: boolean; p: Project | null }>({ open: false, p: null });
  const [del, setDel] = useState<Project | null>(null);
  if (id) return <ProjectDetail id={id} />;
  const upd = async (p: Project, b: Partial<Project>) => { try { await api.updateProject(p.id, b); reload(); } catch (e) { toast("error", errorMessage(e)); } };
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("projects")}</h1>
        <Button onClick={() => setForm({ open: true, p: null })} icon={<Plus className="h-4 w-4" />}>{t("newProject")}</Button>
      </div>
      <div className="flex items-center gap-3">
        <Tabs tabs={[{ id: "active", label: t("projects") }, { id: "archived", label: t("archived") }]} value={tab} onChange={setTab} />
        <Input className="max-w-xs" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <Spinner /> : !data?.length ? <EmptyState icon={<FolderKanban className="h-10 w-10" />} title={t("none")} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card key={p.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <button className="text-start" onClick={() => nav(`/projects/${p.id}`)}><h3 className="font-semibold hover:text-primary-600">{p.name}</h3></button>
                <IconButton label={t("favorite")} onClick={() => upd(p, { is_favorite: !p.is_favorite })}>
                  <Star className={p.is_favorite ? "h-4 w-4 fill-amber-400 text-amber-400" : "h-4 w-4"} /></IconButton>
              </div>
              <p className="line-clamp-2 text-sm text-slate-500">{p.description}</p>
              <div className="mt-auto flex items-center gap-2">
                {p.category && <Badge color="blue">{t("t_" + p.category)}</Badge>}
                <span className="text-xs text-slate-500">{p.document_count} {t("documentsCount")}</span>
                <div className="flex-1" />
                <IconButton label={t("edit")} onClick={() => setForm({ open: true, p })}><Pencil className="h-4 w-4" /></IconButton>
                <IconButton label={p.is_archived ? t("unarchive") : t("archive")} onClick={() => upd(p, { is_archived: !p.is_archived })}>
                  {p.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</IconButton>
                <IconButton label={t("delete")} onClick={() => setDel(p)}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
              </div>
            </Card>))}
        </div>)}
      {form.open && <ProjectForm open onClose={() => setForm({ open: false, p: null })} initial={form.p} onSaved={reload} />}
      <Confirm open={!!del} text={t("confirmDelete")} confirmLabel={t("delete")} cancelLabel={t("cancel")} onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.deleteProject(del!.id); reload(); } catch (e) { toast("error", errorMessage(e)); } }} />
    </div>
  );
}
