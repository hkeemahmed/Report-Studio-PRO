import { useEffect, useState } from "react";
import { api } from "./api";
import { localStore, SyncEngine, type Conflict } from "./offline";

export const sync = new SyncEngine(api);

export function useSyncState() {
  const [state, setState] = useState({ online: sync.online, pending: 0, conflicts: [] as Conflict[] });
  useEffect(() => {
    const update = async () => setState({ online: sync.online, pending: await sync.pendingCount(), conflicts: await localStore.conflicts() });
    update();
    return sync.subscribe(update);
  }, []);
  return state;
}
