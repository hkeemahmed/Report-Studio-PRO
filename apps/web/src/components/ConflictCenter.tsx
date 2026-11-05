import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, Dialog, IconButton, useToast } from "@rsp/ui-components";
import { plainText } from "@rsp/document-schema";
import type { Conflict } from "../lib/offline";
import { sync } from "../lib/sync";
import { useI18n } from "../lib/i18n";
import { errorMessage } from "../lib/api";
import DiffView from "./DiffView";

/** Lists sync conflicts and lets the user choose which copy to keep. No data is discarded silently. */
export default function ConflictCenter({ conflicts }: { conflicts: Conflict[] }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  if (!conflicts.length) return null;
  const ar = lang === "ar";
  const act = async (c: Conflict, choice: "mine" | "server" | "both") => {
    try { await sync.resolve(c.docId, choice); toast("success", ar ? "تم حل التعارض" : "Conflict resolved"); }
    catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <>
      <IconButton label={t("conflict")} onClick={() => setOpen(true)} className="text-warning">
        <AlertTriangle className="h-4 w-4" /><span className="ms-1 text-xs">{conflicts.length}</span></IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("conflict")} wide>
        <div className="space-y-6">
          {conflicts.map((c) => (
            <div key={c.docId} className="space-y-3 rounded-lg border border-amber-300 p-4 dark:border-amber-700">
              <div className="font-semibold">{c.server?.title || c.local.title}</div>
              <p className="text-sm text-slate-500">{ar ? `عدّلت نسخة مبنية على الإصدار ${c.base_version}، بينما الخادم على الإصدار ${c.server?.version}.`
                : `Your edit was based on v${c.base_version}; the server has v${c.server?.version}.`}</p>
              {c.server && <DiffView a={c.server.content} b={c.local.content ?? c.server.content} labels={[ar ? "الخادم" : "Server", ar ? "نسختي" : "Mine"]} fallbackA={plainText(c.server.content)} />}
              {!c.server && <p className="text-danger text-sm">{JSON.stringify(c.diff)}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => act(c, "mine")} disabled={!c.server}>{ar ? "الإبقاء على نسختي" : "Keep mine"}</Button>
                <Button size="sm" variant="secondary" onClick={() => act(c, "server")}>{ar ? "الإبقاء على نسخة الخادم" : "Keep server"}</Button>
                <Button size="sm" variant="secondary" onClick={() => act(c, "both")} disabled={!c.server}>{ar ? "الاحتفاظ بالنسختين" : "Keep both"}</Button>
              </div>
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}
