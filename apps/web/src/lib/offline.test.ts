import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "./api";
import { localStore, SyncEngine } from "./offline";

function fakeApi() {
  const server: Record<string, any> = { d1: { id: "d1", title: "A", version: 1, content: {} } };
  let down = false;
  const api: any = {
    setDown: (v: boolean) => (down = v), server,
    updateDocument: async (id: string, b: any) => {
      if (down) throw new NetworkError("x");
      if (b.base_version !== server[id].version) throw new ApiError(409, { message: "conflict" });
      server[id] = { ...server[id], ...b, version: server[id].version + 1 };
      return server[id];
    },
    document: async (id: string) => { if (down) throw new NetworkError("x"); return server[id]; },
    syncPush: async (_d: string, ops: any[]) => {
      if (down) throw new NetworkError("x");
      return { server_time: "t", results: ops.map((o) => {
        const s = server[o.entity_id];
        if (!s && o.base_version === 0) { server[o.entity_id] = { id: o.entity_id, ...o.data, version: 1 }; return { client_op_id: o.client_op_id, status: "applied" }; }
        if (s.version !== o.base_version) return { client_op_id: o.client_op_id, status: "conflict", server: s };
        server[o.entity_id] = { ...s, ...o.data, version: s.version + 1 };
        return { client_op_id: o.client_op_id, status: "applied" };
      }) };
    },
    syncPull: async () => ({ documents: Object.values(server), deleted: [], server_time: "t2" }),
  };
  return api;
}

describe("offline sync engine", () => {
  beforeEach(async () => { for (const o of await localStore.outbox()) await localStore.removeOutbox(o.docId);
    for (const c of await localStore.conflicts()) await localStore.removeConflict(c.docId); });

  it("saves online directly", async () => {
    const api = fakeApi(); const s = new SyncEngine(api);
    const r = await s.save(api.server.d1, { title: "B" });
    expect(r.status).toBe("saved"); expect(api.server.d1.version).toBe(2);
  });

  it("queues while offline, coalesces edits, and flushes on reconnect", async () => {
    const api = fakeApi(); const s = new SyncEngine(api);
    const base = { ...api.server.d1 };
    api.setDown(true);
    expect((await s.save(base, { title: "offline 1" })).status).toBe("queued");
    expect((await s.save(base, { content: { type: "doc" } })).status).toBe("queued");
    const ob = await localStore.outbox();
    expect(ob).toHaveLength(1);
    expect(ob[0].base_version).toBe(1);
    expect(ob[0].data).toEqual({ title: "offline 1", content: { type: "doc" } });
    expect((await localStore.getDoc("d1"))!.title).toBe("offline 1");
    api.setDown(false);
    await s.flush();
    expect(api.server.d1.title).toBe("offline 1");
    expect(await localStore.outbox()).toHaveLength(0);
  });

  it("never overwrites a newer server version: records a conflict", async () => {
    const api = fakeApi(); const s = new SyncEngine(api);
    const stale = { ...api.server.d1 };
    api.setDown(true);
    await s.save(stale, { title: "mine" });
    api.setDown(false);
    api.server.d1 = { ...api.server.d1, title: "theirs", version: 2 };
    await s.flush();
    expect(api.server.d1.title).toBe("theirs");
    const c = await localStore.conflicts();
    expect(c).toHaveLength(1);
    expect(c[0].local.title).toBe("mine");
    await s.resolve("d1", "mine");
    expect(api.server.d1.title).toBe("mine");
    expect(api.server.d1.version).toBe(3);
    expect(await localStore.conflicts()).toHaveLength(0);
  });

  it("creates documents offline with base_version 0", async () => {
    const api = fakeApi(); const s = new SyncEngine(api);
    const d = await s.createOffline({ title: "جديد", content: { type: "doc" }, layout: {} });
    api.setDown(false);
    await s.flush();
    expect(api.server[d.id].title).toBe("جديد");
  });
});
