/**
 * Offline-first local store (IndexedDB) + Sync Engine.
 * - Every save goes to the server; if the network is down, it is stored locally and queued (outbox).
 * - Queued operations carry the server version they were based on; the server rejects stale ones (conflict),
 *   so a newer server copy is never overwritten silently. Conflicts are kept until the user resolves them.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { ReportDocument } from "@rsp/shared-types";
import { ApiClient, ApiError, NetworkError } from "./api";

export interface OutboxEntry { docId: string; base_version: number; data: Record<string, any>; op: "upsert" | "delete"; ts: number; opId: string }
export interface Conflict { docId: string; local: Record<string, any>; base_version: number; server: ReportDocument; diff?: any; ts: number }

class LocalStore {
  private dbp: Promise<IDBPDatabase> | null = null;
  db() {
    this.dbp ??= openDB("report-studio-pro", 1, {
      upgrade(db) {
        db.createObjectStore("docs", { keyPath: "id" });
        db.createObjectStore("outbox", { keyPath: "docId" });
        db.createObjectStore("conflicts", { keyPath: "docId" });
        db.createObjectStore("meta");
      },
    });
    return this.dbp;
  }
  async getDoc(id: string) { return (await this.db()).get("docs", id) as Promise<ReportDocument | undefined>; }
  async putDoc(d: ReportDocument) { await (await this.db()).put("docs", d); }
  async deleteDoc(id: string) { await (await this.db()).delete("docs", id); }
  async allDocs() { return (await this.db()).getAll("docs") as Promise<ReportDocument[]>; }
  async outbox() { return (await this.db()).getAll("outbox") as Promise<OutboxEntry[]>; }
  async getOutbox(id: string) { return (await this.db()).get("outbox", id) as Promise<OutboxEntry | undefined>; }
  async putOutbox(e: OutboxEntry) { await (await this.db()).put("outbox", e); }
  async removeOutbox(id: string) { await (await this.db()).delete("outbox", id); }
  async conflicts() { return (await this.db()).getAll("conflicts") as Promise<Conflict[]>; }
  async putConflict(c: Conflict) { await (await this.db()).put("conflicts", c); }
  async removeConflict(id: string) { await (await this.db()).delete("conflicts", id); }
  async getMeta<T>(k: string) { return (await this.db()).get("meta", k) as Promise<T | undefined>; }
  async setMeta(k: string, v: any) { await (await this.db()).put("meta", v, k); }
}
export const localStore = new LocalStore();

const uid = () => (crypto as any).randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

export function deviceId(): string {
  let id = localStorage.getItem("rsp.deviceId");
  if (!id) { id = "dev-" + uid(); localStorage.setItem("rsp.deviceId", id); }
  return id;
}

export type SaveResult = { status: "saved"; doc: ReportDocument } | { status: "queued"; doc: ReportDocument } | { status: "conflict"; server: ReportDocument };
type Listener = () => void;

export class SyncEngine {
  private listeners = new Set<Listener>();
  private flushing: Promise<void> | null = null;
  online = typeof navigator === "undefined" ? true : navigator.onLine;

  constructor(private api: ApiClient, private store = localStore) {}

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach((l) => l()); }

  /** Save changes based on `baseVersion`. Falls back to the local queue when offline. */
  async save(doc: ReportDocument, changes: Record<string, any>, opts: { createVersion?: boolean; label?: string } = {}): Promise<SaveResult> {
    const pending = await this.store.getOutbox(doc.id);
    if (pending) return this.queue(doc, changes);  // keep order: earlier offline edits must reach the server first
    try {
      const saved = await this.api.updateDocument(doc.id, { base_version: doc.version, ...changes,
        create_version: !!opts.createVersion, version_label: opts.label || "" });
      this.setOnline(true);
      await this.store.putDoc(saved);
      return { status: "saved", doc: saved };
    } catch (e) {
      if (e instanceof NetworkError) { this.setOnline(false); return this.queue(doc, changes); }
      if (e instanceof ApiError && e.status === 409) {
        const server = await this.api.document(doc.id);
        await this.store.putConflict({ docId: doc.id, local: changes, base_version: doc.version, server, ts: Date.now() });
        this.emit();
        return { status: "conflict", server };
      }
      throw e;
    }
  }

  private async queue(doc: ReportDocument, changes: Record<string, any>): Promise<SaveResult> {
    const prev = await this.store.getOutbox(doc.id);
    const entry: OutboxEntry = { docId: doc.id, op: "upsert", ts: Date.now(), opId: uid(),
      base_version: prev ? prev.base_version : doc.version, data: { ...(prev?.data || {}), ...changes } };
    const local = { ...doc, ...entry.data, updated_at: new Date().toISOString() } as ReportDocument;
    await this.store.putOutbox(entry);
    await this.store.putDoc(local);
    this.emit();
    return { status: "queued", doc: local };
  }

  /** Create a document while offline: client generated id, base_version 0. */
  async createOffline(body: Record<string, any>): Promise<ReportDocument> {
    const id = uid();
    const now = new Date().toISOString();
    const doc = { id, version: 0, status: "draft", is_favorite: false, tags: [], project_id: null, folder_id: null, template_id: null,
      workspace_id: "", created_at: now, updated_at: now, metadata: {}, report_type: "academic", language: "ar", ...body } as unknown as ReportDocument;
    await this.store.putDoc(doc);
    await this.store.putOutbox({ docId: id, op: "upsert", base_version: 0, ts: Date.now(), opId: uid(),
      data: { title: doc.title, content: doc.content, layout: doc.layout, language: doc.language, report_type: doc.report_type, metadata: doc.metadata } });
    this.emit();
    return doc;
  }

  setOnline(v: boolean) { if (this.online !== v) { this.online = v; this.emit(); } }

  async pendingCount() { return (await this.store.outbox()).length; }

  /** Push queued operations; never overwrites newer server data. */
  flush(): Promise<void> {
    this.flushing ??= (async () => {
      const ops = await this.store.outbox();
      if (!ops.length) return;
      let res;
      try { res = await this.api.syncPush(deviceId(), ops.map((o) => ({ client_op_id: o.opId, entity_type: "document",
        entity_id: o.docId, op: o.op, base_version: o.base_version, data: o.data }))); }
      catch (e) { if (e instanceof NetworkError) { this.setOnline(false); return; } throw e; }
      this.setOnline(true);
      for (const r of res.results) {
        const op = ops.find((o) => o.opId === r.client_op_id)!;
        if (r.status === "applied" || r.status === "duplicate") {
          await this.store.removeOutbox(op.docId);
          if (op.op === "upsert") {
            try { await this.store.putDoc(await this.api.document(op.docId)); } catch { /* fetched on next pull */ }
          } else await this.store.deleteDoc(op.docId);
        } else if (r.status === "conflict") {
          await this.store.removeOutbox(op.docId);
          const server = r.server ?? (await this.api.document(op.docId).catch(() => null));
          await this.store.putConflict({ docId: op.docId, local: op.data, base_version: op.base_version, server, diff: r.diff, ts: Date.now() });
        } else if (r.status === "rejected") {
          await this.store.removeOutbox(op.docId);
          await this.store.putConflict({ docId: op.docId, local: op.data, base_version: op.base_version, server: null as any, diff: { error: r.error }, ts: Date.now() });
        }
      }
      this.emit();
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  /** Pull server changes into the local cache (does not touch documents with unsynced local edits). */
  async pull() {
    const since = await this.store.getMeta<string>("lastPull");
    const res = await this.api.syncPull(deviceId(), since);
    const dirty = new Set((await this.store.outbox()).map((o) => o.docId));
    for (const d of res.documents) if (!dirty.has(d.id)) await this.store.putDoc(d);
    for (const id of res.deleted) if (!dirty.has(id)) await this.store.deleteDoc(id);
    await this.store.setMeta("lastPull", res.server_time);
    this.emit();
    return res;
  }

  /** Resolve a conflict: keep mine (re-base on server version), keep server, or keep both (copy). */
  async resolve(docId: string, choice: "mine" | "server" | "both") {
    const c = (await this.store.conflicts()).find((x) => x.docId === docId);
    if (!c) return;
    if (choice === "mine" && c.server) {
      const saved = await this.api.updateDocument(docId, { base_version: c.server.version, ...c.local, create_version: true, version_label: "conflict: kept local" });
      await this.store.putDoc(saved);
    } else if (choice === "both" && c.server) {
      const copy = await this.api.createDocument({ title: (c.local.title || c.server.title) + " (local copy)", content: c.local.content ?? c.server.content,
        layout: c.local.layout ?? c.server.layout, language: c.server.language, report_type: c.server.report_type, metadata: c.server.metadata });
      await this.store.putDoc(copy);
      await this.store.putDoc(c.server);
    } else if (c.server) await this.store.putDoc(c.server);
    await this.store.removeConflict(docId);
    this.emit();
  }

  start() {
    const go = () => { this.setOnline(true); this.flush().then(() => this.pull()).catch(() => {}); };
    window.addEventListener("online", go);
    window.addEventListener("offline", () => this.setOnline(false));
    const t = setInterval(() => { this.flush().catch(() => {}); }, 30000);
    go();
    return () => { window.removeEventListener("online", go); clearInterval(t); };
  }
}
