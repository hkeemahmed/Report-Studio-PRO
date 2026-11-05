import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User, Workspace } from "@rsp/shared-types";
import { api, NetworkError } from "./api";
import { localStore } from "./offline";

type Ctx = { user: User | null; workspace: Workspace | null; loading: boolean; offline: boolean;
  login: (e: string, p: string) => Promise<void>; register: (e: string, p: string, n: string, l: string) => Promise<void>;
  logout: () => void; refresh: () => Promise<void> };
const Auth = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!api.tokens) { setUser(null); setLoading(false); return; }
    try {
      const [u, ws] = await Promise.all([api.me(), api.workspaces()]);
      setUser(u); setWorkspace(ws[0] ?? null); setOffline(false);
      await localStore.setMeta("user", { u, ws: ws[0] });
    } catch (e) {
      if (e instanceof NetworkError) {
        // offline start: reuse cached identity so local work continues
        const cached = await localStore.getMeta<{ u: User; ws: Workspace }>("user");
        if (cached) { setUser(cached.u); setWorkspace(cached.ws); setOffline(true); }
      } else setUser(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { api.onAuthLost = () => setUser(null); refresh(); }, [refresh]);

  return (
    <Auth.Provider value={{
      user, workspace, loading, offline, refresh,
      login: async (e, p) => { await api.login(e, p); await refresh(); },
      register: async (e, p, n, l) => { await api.register(e, p, n, l); await refresh(); },
      logout: () => { api.logout(); setUser(null); },
    }}>{children}</Auth.Provider>
  );
}
export const useAuth = () => useContext(Auth);
