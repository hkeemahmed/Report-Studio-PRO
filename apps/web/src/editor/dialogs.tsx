import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import katex from "katex";
import type { PageLayout, Source } from "@rsp/shared-types";
import { normalizeLayout, PAGE_SIZES_MM } from "@rsp/document-schema";
import { parseCSV, renderChartSVG, searchKey, svgToPng, type ChartSpec, type ChartType } from "@rsp/editor-core";
import { Button, Dialog, Field, Input, Select, Textarea, cx, useToast } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";

export type DialogKind = "table" | "image" | "crop" | "chart" | "equation" | "link" | "shape" | "pageSetup" | "headerFooter" |
  "citation" | "footnote" | "cover" | "find" | "aiResult" | "saveAs" | "compare" | "versions" | null;

const ar = () => document.documentElement.lang === "ar";
const L = (a: string, e: string) => (ar() ? a : e);

/* ---------------- Table ---------------- */
export function TableDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [rows, setRows] = useState(3), [cols, setCols] = useState(3), [header, setHeader] = useState(true), [caption, setCaption] = useState("");
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  const insert = (r = rows, c = cols) => {
    // Close first so focus returns to the editor before we move the selection into the new table;
    // otherwise the browser's stale DOM selection is re-applied on focus.
    onClose();
    requestAnimationFrame(() => doInsert(r, c));
  };
  const doInsert = (r: number, c: number) => {
    const before = editor.state.selection.from;
    editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: header }).run();
    // Tiptap leaves the cursor in the previous paragraph when inserting after text: move it into the first cell.
    let tpos = -1;
    editor.state.doc.nodesBetween(Math.max(0, before - 1), editor.state.doc.content.size, (n, pos) => {
      if (tpos < 0 && n.type.name === "table") { tpos = pos; return false; }
      return tpos < 0;
    });
    if (tpos >= 0) editor.chain().focus().setTextSelection(tpos + 4).run();
    if (caption) editor.chain().updateAttributes("table", { caption }).run();
  };
  return (
    <Dialog open onClose={onClose} title={L("إدراج جدول", "Insert table")} footer={<Button onClick={() => insert()}>{L("إدراج", "Insert")}</Button>}>
      <div className="mb-4 inline-grid grid-cols-10 gap-0.5" onMouseLeave={() => setHover([0, 0])} dir="ltr">
        {Array.from({ length: 80 }, (_, i) => { const r = Math.floor(i / 10) + 1, c = (i % 10) + 1;
          return <button key={i} aria-label={`${r}x${c}`} onMouseEnter={() => setHover([r, c])} onClick={() => insert(r, c)}
            className={cx("h-5 w-5 border", r <= hover[0] && c <= hover[1] ? "border-primary-500 bg-primary-200" : "border-slate-300 bg-white dark:bg-navy-900")} />; })}
      </div>
      <div className="text-sm text-slate-500">{hover[0] ? `${hover[0]} × ${hover[1]}` : ""}</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={L("الصفوف", "Rows")}><Input type="number" min={1} max={100} value={rows} onChange={(e) => setRows(+e.target.value)} /></Field>
        <Field label={L("الأعمدة", "Columns")}><Input type="number" min={1} max={20} value={cols} onChange={(e) => setCols(+e.target.value)} /></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />{L("صف عناوين", "Header row")}</label>
        <div className="col-span-2"><Field label={L("التعليق التوضيحي (ترقيم تلقائي)", "Caption (auto-numbered)")}><Input value={caption} onChange={(e) => setCaption(e.target.value)} /></Field></div>
      </div>
    </Dialog>
  );
}

/* ---------------- Image ---------------- */
export async function fileToDataUrl(file: File, maxDim = 1800): Promise<string> {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) throw new Error(L("نوع الصورة غير مدعوم", "Unsupported image type"));
  if (file.size > 15 * 1024 * 1024) throw new Error(L("الصورة أكبر من 15MB", "Image larger than 15MB"));
  const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  if (file.type === "image/gif") return url;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return url;
  const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
}

export function ImageDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const toast = useToast();
  const [src, setSrc] = useState(""), [caption, setCaption] = useState(""), [width, setWidth] = useState("60%"), [align, setAlign] = useState("center"), [alt, setAlt] = useState("");
  const onFile = async (f?: File) => { if (!f) return; try { setSrc(await fileToDataUrl(f)); setAlt(f.name); } catch (e) { toast("error", errorMessage(e)); } };
  return (
    <Dialog open onClose={onClose} title={L("إدراج صورة", "Insert image")}
      footer={<Button disabled={!src} onClick={() => { editor.chain().focus().setImage({ src, alt } as any).updateAttributes("image", { caption, width, align }).run(); onClose(); }}>{L("إدراج", "Insert")}</Button>}>
      <div className="space-y-3">
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => onFile(e.target.files?.[0])} aria-label="image file" />
        <div className="text-center text-xs text-slate-500">{L("أو", "or")}</div>
        <Field label="URL (https://…)"><Input dir="ltr" placeholder="https://" onBlur={(e) => /^https?:\/\//.test(e.target.value) && setSrc(e.target.value)} /></Field>
        {src && <img src={src} alt="" className="mx-auto max-h-48 rounded border" />}
        <Field label={L("التعليق التوضيحي (شكل N)", "Caption (Figure N)")}><Input value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("العرض", "Width")}><Select value={width} onChange={(e) => setWidth(e.target.value)}>{["25%", "40%", "50%", "60%", "75%", "100%"].map((w) => <option key={w}>{w}</option>)}</Select></Field>
          <Field label={L("المحاذاة", "Alignment")}><Select value={align} onChange={(e) => setAlign(e.target.value)}>
            <option value="right">{L("يمين", "Right")}</option><option value="center">{L("وسط", "Center")}</option><option value="left">{L("يسار", "Left")}</option></Select></Field>
        </div>
      </div>
    </Dialog>
  );
}

/** Crop the selected image with a draggable rectangle; replaces src with the cropped PNG. */
export function CropDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const src = editor.getAttributes("image").src as string;
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pos = (e: React.MouseEvent) => { const b = imgRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(e.clientX - b.left, b.width)), y: Math.max(0, Math.min(e.clientY - b.top, b.height)) }; };
  const apply = async () => {
    const img = imgRef.current!; if (!rect) return;
    const sx = img.naturalWidth / img.clientWidth, sy = img.naturalHeight / img.clientHeight;
    const c = document.createElement("canvas"); c.width = Math.round(rect.w * sx); c.height = Math.round(rect.h * sy);
    const i2 = new Image(); i2.crossOrigin = "anonymous"; i2.src = src; await new Promise((r) => (i2.onload = r));
    c.getContext("2d")!.drawImage(i2, rect.x * sx, rect.y * sy, rect.w * sx, rect.h * sy, 0, 0, c.width, c.height);
    editor.chain().focus().updateAttributes("image", { src: c.toDataURL("image/png") }).run();
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={L("قص الصورة", "Crop image")} wide footer={<Button disabled={!rect || rect.w < 4} onClick={apply}>{L("تطبيق القص", "Apply crop")}</Button>}>
      <p className="mb-2 text-sm text-slate-500">{L("اسحب لتحديد المنطقة", "Drag to select the area to keep")}</p>
      <div className="relative inline-block select-none" dir="ltr"
        onMouseDown={(e) => { start.current = pos(e); setRect(null); }}
        onMouseMove={(e) => { if (!start.current) return; const p = pos(e), s = start.current; setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); }}
        onMouseUp={() => (start.current = null)}>
        <img ref={imgRef} src={src} alt="" className="max-h-[60vh] max-w-full" draggable={false} />
        {rect && <div className="pointer-events-none absolute border-2 border-primary-500 bg-primary-500/10" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
      </div>
    </Dialog>
  );
}

/* ---------------- Chart ---------------- */
export function ChartDialog({ editor, onClose, initial, pos }: { editor: Editor; onClose: () => void; initial?: any; pos?: number }) {
  const [spec, setSpec] = useState<ChartSpec>(initial?.spec || { type: "bar", title: "", labels: ["A", "B", "C"], series: [{ name: L("القيم", "Values"), data: [10, 20, 15] }] });
  const [csv, setCsv] = useState(() => [["label", ...spec.series.map((s) => s.name)].join(","), ...spec.labels.map((l, i) => [l, ...spec.series.map((s) => s.data[i] ?? "")].join(","))].join("\n"));
  const [caption, setCaption] = useState(initial?.caption || "");
  const svg = useMemo(() => renderChartSVG(spec), [spec]);
  const onCsv = (v: string) => { setCsv(v); const p = parseCSV(v); if (p) setSpec({ ...p, type: spec.type, title: spec.title }); };
  const insert = async () => {
    const image = await svgToPng(svg);
    const attrs = { spec, image, caption, width: "80%" };
    if (pos != null) editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, attrs); return true; }).run();
    else editor.chain().focus().insertChart(attrs).run();
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={L("رسم بياني", "Chart")} wide footer={<Button onClick={insert}>{pos != null ? L("تحديث", "Update") : L("إدراج", "Insert")}</Button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label={L("النوع", "Type")}><Select value={spec.type} onChange={(e) => setSpec({ ...spec, type: e.target.value as ChartType })}>
            <option value="bar">Bar</option><option value="line">Line</option><option value="pie">Pie</option><option value="scatter">Scatter</option></Select></Field>
          <Field label={L("العنوان", "Title")}><Input value={spec.title} onChange={(e) => setSpec({ ...spec, title: e.target.value })} /></Field>
          <Field label={L("البيانات (CSV: التسمية، السلاسل…)", "Data (CSV: label, series…)")}><Textarea dir="ltr" rows={8} className="font-mono" value={csv} onChange={(e) => onCsv(e.target.value)} /></Field>
          <Field label={L("التعليق التوضيحي", "Caption")}><Input value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
        </div>
        <div className="rounded border bg-white p-2" dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="width:100%;height:auto" ') }} />
      </div>
    </Dialog>
  );
}

/* ---------------- Shapes ---------------- */
export function ShapeDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [shape, setShape] = useState("rect"), [color, setColor] = useState("#2563eb"), [label, setLabel] = useState("");
  const svg = useMemo(() => {
    const t = label ? `<text x="200" y="108" font-size="22" text-anchor="middle" fill="${shape === "line" || shape === "arrow" ? color : "#fff"}" font-family="Cairo, Arial">${label.replace(/[<&>]/g, "")}</text>` : "";
    const s: Record<string, string> = {
      rect: `<rect x="20" y="20" width="360" height="160" rx="8" fill="${color}"/>`, rounded: `<rect x="20" y="20" width="360" height="160" rx="60" fill="${color}"/>`,
      ellipse: `<ellipse cx="200" cy="100" rx="180" ry="80" fill="${color}"/>`, diamond: `<polygon points="200,10 390,100 200,190 10,100" fill="${color}"/>`,
      arrow: `<line x1="20" y1="100" x2="360" y2="100" stroke="${color}" stroke-width="8"/><polygon points="390,100 350,75 350,125" fill="${color}"/>`,
      line: `<line x1="20" y1="100" x2="380" y2="100" stroke="${color}" stroke-width="6"/>`,
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">${s[shape]}${shape === "arrow" || shape === "line" ? t.replace('y="108"', 'y="80"') : t}</svg>`;
  }, [shape, color, label]);
  return (
    <Dialog open onClose={onClose} title={L("إدراج شكل", "Insert shape")}
      footer={<Button onClick={async () => { const src = await svgToPng(svg); editor.chain().focus().setImage({ src, alt: label || shape } as any).updateAttributes("image", { width: "40%" }).run(); onClose(); }}>{L("إدراج", "Insert")}</Button>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">{["rect", "rounded", "ellipse", "diamond", "arrow", "line"].map((s) =>
          <Button key={s} variant={s === shape ? "primary" : "secondary"} size="sm" onClick={() => setShape(s)}>{s}</Button>)}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L("اللون", "Color")}><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></Field>
          <Field label={L("نص", "Label")}><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        </div>
        <div className="rounded border bg-white p-2" dangerouslySetInnerHTML={{ __html: svg.replace("<svg ", '<svg style="width:100%;height:auto" ') }} />
      </div>
    </Dialog>
  );
}

/* ---------------- Equation ---------------- */
export function EquationDialog({ editor, onClose, initial, pos }: { editor: Editor; onClose: () => void; initial?: any; pos?: number }) {
  const [latex, setLatex] = useState(initial?.latex || "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}");
  const [inline, setInline] = useState(false);
  const html = useMemo(() => katex.renderToString(latex || "\\square", { displayMode: true, throwOnError: false }), [latex]);
  const samples = ["E=mc^2", "\\sum_{i=1}^{n} x_i", "\\int_0^\\infty e^{-x}dx", "\\bar{x}=\\frac{1}{n}\\sum x_i", "\\sigma=\\sqrt{\\frac{\\sum (x-\\mu)^2}{N}}", "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}"];
  return (
    <Dialog open onClose={onClose} title={L("معادلة رياضية (LaTeX)", "Equation (LaTeX)")} wide
      footer={<Button onClick={() => {
        if (pos != null) editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { latex }); return true; }).run();
        else editor.chain().focus().insertEquation(latex, inline).run();
        onClose(); }}>{pos != null ? L("تحديث", "Update") : L("إدراج", "Insert")}</Button>}>
      <div className="space-y-3">
        <Textarea dir="ltr" rows={3} className="font-mono" value={latex} onChange={(e) => setLatex(e.target.value)} />
        <div className="flex flex-wrap gap-1">{samples.map((s) => <Button key={s} size="sm" variant="secondary" onClick={() => setLatex(s)}><span dir="ltr" className="font-mono text-xs">{s.slice(0, 22)}</span></Button>)}</div>
        <div className="min-h-16 rounded border bg-white p-3 text-black" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />
        {pos == null && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inline} onChange={(e) => setInline(e.target.checked)} />{L("ضمن السطر", "Inline")}</label>}
      </div>
    </Dialog>
  );
}

/* ---------------- Link ---------------- */
export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState(editor.getAttributes("link").href || "https://");
  const valid = /^(https?:\/\/|mailto:)\S+$/.test(href);
  return (
    <Dialog open onClose={onClose} title={L("ارتباط تشعبي", "Hyperlink")}
      footer={<>
        {editor.isActive("link") && <Button variant="secondary" onClick={() => { editor.chain().focus().unsetLink().run(); onClose(); }}>{L("إزالة", "Remove")}</Button>}
        <Button disabled={!valid} onClick={() => {
          if (editor.state.selection.empty) editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
          onClose(); }}>{L("تطبيق", "Apply")}</Button></>}>
      <Input dir="ltr" value={href} onChange={(e) => setHref(e.target.value)} />
    </Dialog>
  );
}

/* ---------------- Page setup / Header-footer ---------------- */
export function PageSetupDialog({ layout, onChange, onClose }: { layout: PageLayout; onChange: (l: PageLayout) => void; onClose: () => void }) {
  const [l, setL] = useState<PageLayout>(layout);
  const m = l.margins_mm;
  const setM = (k: keyof typeof m, v: number) => setL({ ...l, margins_mm: { ...m, [k]: v } });
  return (
    <Dialog open onClose={onClose} title={L("إعداد الصفحة", "Page setup")} wide footer={<Button onClick={() => { onChange(normalizeLayout(l)); onClose(); }}>{L("تطبيق", "Apply")}</Button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={L("حجم الورق", "Paper size")}><Select value={l.pageSize} onChange={(e) => setL({ ...l, pageSize: e.target.value as any })}>
          {[...Object.keys(PAGE_SIZES_MM), "Custom"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
        <Field label={L("الاتجاه", "Orientation")}><Select value={l.orientation} onChange={(e) => setL({ ...l, orientation: e.target.value as any })}>
          <option value="portrait">{L("عمودي", "Portrait")}</option><option value="landscape">{L("أفقي", "Landscape")}</option></Select></Field>
        {l.pageSize === "Custom" && <>
          <Field label={L("العرض (مم)", "Width (mm)")}><Input type="number" min={50} max={1200} value={l.width_mm} onChange={(e) => setL({ ...l, width_mm: +e.target.value })} /></Field>
          <Field label={L("الارتفاع (مم)", "Height (mm)")}><Input type="number" min={50} max={1200} value={l.height_mm} onChange={(e) => setL({ ...l, height_mm: +e.target.value })} /></Field></>}
        {(["top", "bottom", "right", "left"] as const).map((k) => (
          <Field key={k} label={L({ top: "الهامش العلوي", bottom: "الهامش السفلي", right: "الهامش الأيمن", left: "الهامش الأيسر" }[k], `${k} margin`) + " (mm)"}>
            <Input type="number" min={0} max={100} value={m[k]} onChange={(e) => setM(k, +e.target.value)} /></Field>))}
        <Field label={L("الأعمدة", "Columns")}><Select value={l.columns} onChange={(e) => setL({ ...l, columns: +e.target.value })}>{[1, 2, 3].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label={L("الخط الافتراضي", "Default font")}><Select value={l.fontFamily} onChange={(e) => setL({ ...l, fontFamily: e.target.value })}>
          {["Amiri", "Cairo", "Noto Naskh Arabic", "Noto Sans Arabic", "Arial", "Times New Roman"].map((f) => <option key={f}>{f}</option>)}</Select></Field>
        <Field label={L("حجم الخط (pt)", "Font size (pt)")}><Input type="number" min={8} max={32} value={l.fontSize} onChange={(e) => setL({ ...l, fontSize: +e.target.value })} /></Field>
        <Field label={L("تباعد الأسطر", "Line spacing")}><Select value={l.lineHeight} onChange={(e) => setL({ ...l, lineHeight: +e.target.value })}>{[1, 1.15, 1.5, 2, 2.5].map((v) => <option key={v}>{v}</option>)}</Select></Field>
        <Field label={L("لون العناوين", "Heading color")}><Input type="color" value={l.headingColor} onChange={(e) => setL({ ...l, headingColor: e.target.value })} /></Field>
        <Field label={L("اتجاه المستند", "Document direction")}><Select value={l.direction} onChange={(e) => setL({ ...l, direction: e.target.value as any })}>
          <option value="rtl">RTL — {L("من اليمين", "Right to left")}</option><option value="ltr">LTR — {L("من اليسار", "Left to right")}</option></Select></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.pageBorder} onChange={(e) => setL({ ...l, pageBorder: e.target.checked })} />{L("حدود الصفحة", "Page border")}</label>
      </div>
    </Dialog>
  );
}

export function HeaderFooterDialog({ layout, onChange, onClose }: { layout: PageLayout; onChange: (l: PageLayout) => void; onClose: () => void }) {
  const [l, setL] = useState<PageLayout>(layout);
  const al = (v: string, set: (a: any) => void) => <Select value={v} onChange={(e) => set(e.target.value)}>
    <option value="right">{L("يمين", "Right")}</option><option value="center">{L("وسط", "Center")}</option><option value="left">{L("يسار", "Left")}</option></Select>;
  return (
    <Dialog open onClose={onClose} title={L("الترويسة والتذييل وأرقام الصفحات", "Header, footer & page numbers")} wide footer={<Button onClick={() => { onChange(l); onClose(); }}>{L("تطبيق", "Apply")}</Button>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={L("نص الترويسة ({title} = عنوان التقرير)", "Header text ({title} = report title)")}><Input value={l.header.text} onChange={(e) => setL({ ...l, header: { ...l.header, text: e.target.value } })} /></Field>
        <Field label={L("محاذاة الترويسة", "Header alignment")}>{al(l.header.align, (a) => setL({ ...l, header: { ...l.header, align: a } }))}</Field>
        <Field label={L("نص التذييل", "Footer text")}><Input value={l.footer.text} onChange={(e) => setL({ ...l, footer: { ...l.footer, text: e.target.value } })} /></Field>
        <Field label={L("محاذاة التذييل", "Footer alignment")}>{al(l.footer.align, (a) => setL({ ...l, footer: { ...l.footer, align: a } }))}</Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.pageNumbers.enabled} onChange={(e) => setL({ ...l, pageNumbers: { ...l.pageNumbers, enabled: e.target.checked } })} />{L("ترقيم الصفحات", "Page numbers")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.differentFirstPage} onChange={(e) => setL({ ...l, differentFirstPage: e.target.checked })} />{L("صفحة أولى مختلفة (الغلاف)", "Different first page (cover)")}</label>
        <Field label={L("موضع الرقم", "Number position")}><Select value={l.pageNumbers.position} onChange={(e) => setL({ ...l, pageNumbers: { ...l.pageNumbers, position: e.target.value as any } })}>
          <option value="footer">{L("التذييل", "Footer")}</option><option value="header">{L("الترويسة", "Header")}</option></Select></Field>
        <Field label={L("محاذاة الرقم", "Number alignment")}>{al(l.pageNumbers.align, (a) => setL({ ...l, pageNumbers: { ...l.pageNumbers, align: a } }))}</Field>
        <Field label={L("تنسيق الأرقام", "Number format")}><Select value={l.pageNumbers.format} onChange={(e) => setL({ ...l, pageNumbers: { ...l.pageNumbers, format: e.target.value as any } })}>
          <option value="arabic">1, 2, 3</option><option value="arabic-indic">١، ٢، ٣</option><option value="roman">i, ii, iii</option></Select></Field>
        <Field label={L("البدء من", "Start at")}><Input type="number" min={0} value={l.pageNumbers.start} onChange={(e) => setL({ ...l, pageNumbers: { ...l.pageNumbers, start: +e.target.value } })} /></Field>
      </div>
    </Dialog>
  );
}

/* ---------------- Citation / Footnote / Cover ---------------- */
export function CitationDialog({ editor, onClose, sources, reload }: { editor: Editor; onClose: () => void; sources: Source[]; reload: () => void }) {
  const [q, setQ] = useState(""), [locator, setLocator] = useState("");
  const [quick, setQuick] = useState({ title: "", family: "", given: "", year: "", source_type: "book" });
  const toast = useToast();
  const list = sources.filter((s) => (s.title + s.authors.map((a) => a.family).join(" ") + s.year).toLowerCase().includes(q.toLowerCase()));
  const add = async () => {
    try { const s = await api.createSource({ title: quick.title, year: quick.year, source_type: quick.source_type, authors: [{ family: quick.family, given: quick.given }] } as any);
      reload(); editor.chain().focus().insertCitation({ sourceId: s.id, locator }).run(); onClose(); } catch (e) { toast("error", errorMessage(e)); }
  };
  return (
    <Dialog open onClose={onClose} title={L("إدراج استشهاد", "Insert citation")} wide>
      <div className="space-y-3">
        <div className="flex gap-2"><Input placeholder={L("بحث في المصادر…", "Search sources…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <Input className="w-40" placeholder={L("الصفحة", "Page")} value={locator} onChange={(e) => setLocator(e.target.value)} /></div>
        <div className="max-h-64 divide-y overflow-auto rounded border dark:divide-navy-700 dark:border-navy-700">
          {list.length === 0 && <p className="p-3 text-sm text-slate-500">{L("لا توجد مصادر. أضف مصدراً أدناه أو من صفحة المراجع.", "No sources. Add one below or from the References page.")}</p>}
          {list.map((s) => (
            <button key={s.id} className="block w-full p-2 text-start text-sm hover:bg-slate-50 dark:hover:bg-navy-800" dir="auto"
              onClick={() => { editor.chain().focus().insertCitation({ sourceId: s.id, locator }).run(); onClose(); }}>
              <b>{s.authors.map((a) => a.family).join(", ")}</b> ({s.year}) — {s.title}</button>))}
        </div>
        <details><summary className="cursor-pointer text-sm text-primary-500">{L("إضافة مصدر سريع", "Quick add source")}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input placeholder={L("العنوان", "Title")} value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} />
            <Select value={quick.source_type} onChange={(e) => setQuick({ ...quick, source_type: e.target.value })}>
              {["book", "article", "website", "thesis", "journal", "report"].map((x) => <option key={x}>{x}</option>)}</Select>
            <Input placeholder={L("اسم العائلة", "Family name")} value={quick.family} onChange={(e) => setQuick({ ...quick, family: e.target.value })} />
            <Input placeholder={L("الاسم الأول", "Given name")} value={quick.given} onChange={(e) => setQuick({ ...quick, given: e.target.value })} />
            <Input placeholder={L("السنة", "Year")} value={quick.year} onChange={(e) => setQuick({ ...quick, year: e.target.value })} />
            <Button disabled={!quick.title} onClick={add}>{L("إضافة وإدراج", "Add & insert")}</Button>
          </div></details>
      </div>
    </Dialog>
  );
}

export function FootnoteDialog({ editor, onClose, initial, pos }: { editor: Editor; onClose: () => void; initial?: any; pos?: number }) {
  const [text, setText] = useState(initial?.text || "");
  return (
    <Dialog open onClose={onClose} title={L("حاشية / هامش", "Footnote / endnote")}
      footer={<Button disabled={!text.trim()} onClick={() => {
        if (pos != null) editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { text }); return true; }).run();
        else editor.chain().focus().insertFootnote(text).run(); onClose(); }}>{L("حفظ", "Save")}</Button>}>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="mt-2 text-xs text-slate-500">{L("تُرقّم الحواشي تلقائياً وتُجمع في قسم الهوامش عند التصدير.", "Notes are auto-numbered and collected in a Notes section on export.")}</p>
    </Dialog>
  );
}

export function CoverDialog({ editor, onClose, initial, pos }: { editor: Editor; onClose: () => void; initial: any; pos: number }) {
  const [a, setA] = useState(initial);
  const fields: [string, string, string][] = [["title", "العنوان", "Title"], ["author", "إعداد", "Author"], ["university", "الجامعة", "University"],
    ["college", "الكلية", "College"], ["department", "القسم", "Department"], ["stage", "المرحلة", "Stage"], ["supervisor", "المشرف", "Supervisor"], ["date", "التاريخ", "Date"]];
  return (
    <Dialog open onClose={onClose} title={L("صفحة الغلاف", "Cover page")}
      footer={<Button onClick={() => { editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, a); return true; }).run(); onClose(); }}>{L("حفظ", "Save")}</Button>}>
      <div className="grid grid-cols-2 gap-3">{fields.map(([k, ar_, en]) => <Field key={k} label={L(ar_, en)}><Input value={a[k] || ""} onChange={(e) => setA({ ...a, [k]: e.target.value })} /></Field>)}</div>
    </Dialog>
  );
}

/* ---------------- Find & Replace ---------------- */
export function FindReplace({ editor, onClose, replaceMode }: { editor: Editor; onClose: () => void; replaceMode?: boolean }) {
  const [term, setTerm] = useState(""), [rep, setRep] = useState(""), [cs, setCs] = useState(false);
  const [count, setCount] = useState(0);
  useEffect(() => { editor.commands.setSearchTerm(term, cs); }, [term, cs, editor]);
  useEffect(() => {
    const f = () => setCount(searchKey.getState(editor.state)?.matches.length ?? 0);
    editor.on("transaction", f); f();
    return () => { editor.off("transaction", f); editor.commands.setSearchTerm(""); };
  }, [editor]);
  return (
    <div className="absolute end-4 top-2 z-30 w-80 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-navy-700 dark:bg-navy-800" role="search">
      <div className="flex items-center gap-2">
        <Input autoFocus placeholder={L("بحث", "Find")} value={term} onChange={(e) => setTerm(e.target.value)} data-testid="find-input"
          onKeyDown={(e) => { if (e.key === "Enter") e.shiftKey ? editor.commands.prevMatch() : editor.commands.nextMatch(); if (e.key === "Escape") onClose(); }} />
        <span className="w-14 text-center text-xs text-slate-500" data-testid="find-count">{count}</span>
      </div>
      {replaceMode !== false && <Input placeholder={L("استبدال بـ", "Replace with")} value={rep} onChange={(e) => setRep(e.target.value)} />}
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="secondary" onClick={() => editor.commands.prevMatch()}>↑</Button>
        <Button size="sm" variant="secondary" onClick={() => editor.commands.nextMatch()}>↓</Button>
        <Button size="sm" variant="secondary" onClick={() => editor.commands.replaceCurrent(rep)}>{L("استبدال", "Replace")}</Button>
        <Button size="sm" variant="secondary" onClick={() => editor.commands.replaceAll(rep)}>{L("الكل", "All")}</Button>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={cs} onChange={(e) => setCs(e.target.checked)} />Aa</label>
        <div className="flex-1" /><Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
      </div>
    </div>
  );
}
