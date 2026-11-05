import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./api";

export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await fn()); setError(""); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export const fmtDate = (s: string, lang: string) => new Date(s).toLocaleString(lang === "ar" ? "ar-IQ" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
