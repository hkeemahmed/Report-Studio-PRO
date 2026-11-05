import { useEffect, useState } from "react";
import type { DiffResult } from "@rsp/shared-types";
import { Spinner } from "@rsp/ui-components";
import { api } from "../lib/api";

export function DiffOps({ diff }: { diff: DiffResult }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500">similarity {(diff.similarity * 100).toFixed(1)}% · +{diff.stats.inserted} / −{diff.stats.deleted}</div>
      <div dir="auto" className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-doc text-sm leading-7 dark:bg-navy-900">
        {diff.ops.map((o, i) => o.op === "equal" ? <span key={i}>{o.text} </span>
          : o.op === "insert" ? <ins key={i} className="bg-green-100 text-green-800 no-underline dark:bg-green-900/40 dark:text-green-200">{o.text} </ins>
          : <del key={i} className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">{o.text} </del>)}
      </div>
    </div>
  );
}

export default function DiffView({ a, b, labels }: { a: any; b: any; labels: [string, string]; fallbackA?: string }) {
  const [diff, setDiff] = useState<DiffResult | null>(null);
  useEffect(() => { api.compareDocs(a, b).then(setDiff).catch(() => setDiff(null)); }, [a, b]);
  return (
    <div>
      <div className="mb-1 flex gap-4 text-xs"><span className="text-red-600">− {labels[0]}</span><span className="text-green-600">+ {labels[1]}</span></div>
      {diff ? <DiffOps diff={diff} /> : <Spinner />}
    </div>
  );
}
