import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { PageLayout } from "@rsp/shared-types";
import { MM_TO_PX, pageDims } from "@rsp/document-schema";
import { paginationKey } from "@rsp/editor-core";
import { cx } from "@rsp/ui-components";

export function Ruler({ layout, zoom, onChange }: { layout: PageLayout; zoom: number; onChange: (l: PageLayout) => void }) {
  const { w } = pageDims(layout);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<"left" | "right" | null>(null);
  const px = w * MM_TO_PX * zoom;
  const m = layout.margins_mm;
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current || !ref.current) return;
      const b = ref.current.getBoundingClientRect();
      let mm = ((e.clientX - b.left) / b.width) * w;
      if (drag.current === "right") mm = w - mm;
      mm = Math.round(Math.max(0, Math.min(w / 2 - 10, mm)) * 2) / 2;
      onChange({ ...layout, margins_mm: { ...m, [drag.current]: mm } });
    };
    const up = () => (drag.current = null);
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [layout, w, m, onChange]);
  const ticks = [];
  for (let cm = 0; cm <= w / 10; cm++) ticks.push(cm);
  return (
    <div className="sticky top-0 z-10 flex justify-center bg-slate-200 py-1 dark:bg-navy-950" dir="ltr">
      <div ref={ref} className="relative h-6 select-none rounded-sm bg-white text-[9px] text-slate-500" style={{ width: px }} data-testid="ruler">
        <div className="absolute inset-y-0 left-0 bg-slate-300/70" style={{ width: (m.left / w) * 100 + "%" }} />
        <div className="absolute inset-y-0 right-0 bg-slate-300/70" style={{ width: (m.right / w) * 100 + "%" }} />
        {ticks.map((cm) => <div key={cm} className="absolute bottom-0 border-l border-slate-400" style={{ left: ((cm * 10) / w) * 100 + "%", height: cm % 5 === 0 ? 10 : 6 }}>
          {cm % 2 === 0 && <span className="absolute -top-3 -translate-x-1/2">{cm}</span>}</div>)}
        {(["left", "right"] as const).map((side) => (
          <div key={side} role="slider" aria-label={`${side} margin`} aria-valuenow={m[side]} tabIndex={0} title={`${m[side]} mm`}
            onMouseDown={(e) => { e.preventDefault(); drag.current = side; }}
            onKeyDown={(e) => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) onChange({ ...layout, margins_mm: { ...m, [side]: Math.max(0, m[side] + (side === "left" ? d : -d)) } }); }}
            className="absolute top-0 h-full w-2 -translate-x-1/2 cursor-ew-resize bg-primary-500" style={{ left: side === "left" ? `${(m.left / w) * 100}%` : `${100 - (m.right / w) * 100}%` }} />))}
      </div>
    </div>
  );
}

export default function Canvas({ editor, layout, zoom, title, spell, lang, onPages }: { editor: Editor; layout: PageLayout; zoom: number; title: string;
  spell: boolean; lang: string; onPages: (n: number) => void }) {
  const { w, h } = pageDims(layout);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetH, setSheetH] = useState(h * MM_TO_PX);
  const m = layout.margins_mm;
  const paginate = layout.columns === 1;

  // Push page furniture (size/margins/header/footer/numbers) into the layout engine.
  useEffect(() => {
    const tr = editor.state.tr.setMeta(paginationKey, { furniture: {
      enabled: paginate, pageHeightPx: h * MM_TO_PX, marginTopPx: m.top * MM_TO_PX, marginBottomPx: m.bottom * MM_TO_PX, gapPx: 24,
      header: layout.header.text.replace("{title}", title), footer: layout.footer.text.replace("{title}", title),
      headerAlign: layout.header.align, footerAlign: layout.footer.align, pageNumbers: layout.pageNumbers,
      skipFirst: layout.differentFirstPage && editor.state.doc.firstChild?.type.name === "coverPage",
    }, result: null }).setMeta("addToHistory", false);
    editor.view.dispatch(tr);
  }, [editor, layout, title, h, m.top, m.bottom, paginate]);

  useEffect(() => {
    (editor.view.dom as HTMLElement).dataset.zoom = String(zoom);
    editor.view.dom.setAttribute("spellcheck", String(spell));
    editor.view.dom.setAttribute("lang", lang);
    const f = (e: Event) => onPages((e as CustomEvent).detail);
    editor.view.dom.addEventListener("rsp-pages", f);
    return () => editor.view.dom.removeEventListener("rsp-pages", f);
  }, [editor, zoom, spell, lang, onPages]);

  useLayoutEffect(() => {
    if (!sheetRef.current) return;
    const ro = new ResizeObserver(() => setSheetH(sheetRef.current!.offsetHeight));
    ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, []);

  const wpx = w * MM_TO_PX;
  return (
    <div className="rsp-sheet-wrap" style={{ width: wpx * zoom, height: sheetH * zoom, direction: "ltr" }}>
      <div ref={sheetRef} data-testid="sheet"
        className={cx("rsp-sheet", !paginate && "no-paginate", layout.pageBorder && "page-border")}
        style={{
          width: wpx, transform: `scale(${zoom})`, transformOrigin: "top left",
          paddingLeft: m.left * MM_TO_PX, paddingRight: m.right * MM_TO_PX,
          paddingTop: paginate ? 0 : m.top * MM_TO_PX, paddingBottom: paginate ? 0 : m.bottom * MM_TO_PX, minHeight: paginate ? undefined : h * MM_TO_PX,
          fontFamily: `'${layout.fontFamily}', 'Amiri', 'Noto Naskh Arabic', serif`, fontSize: `${layout.fontSize}pt`, lineHeight: layout.lineHeight,
          direction: layout.direction, columnCount: paginate ? undefined : layout.columns, columnGap: "8mm",
          outline: layout.pageBorder ? "2px solid #1e3a8a" : undefined, outlineOffset: layout.pageBorder ? -12 : undefined,
          ["--heading-color" as any]: layout.headingColor, ["--ml" as any]: `${m.left * MM_TO_PX}px`, ["--mr" as any]: `${m.right * MM_TO_PX}px`,
          ["--mt" as any]: `${m.top * MM_TO_PX}px`, ["--mb" as any]: `${m.bottom * MM_TO_PX}px`,
        }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
