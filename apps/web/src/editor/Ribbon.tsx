import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, BookOpen, CheckCheck, Columns2, Copy, Download, FileDown, FileInput,
  FilePlus, FileText, FolderOpen, GitCompare, Heading, Highlighter, History, Image as ImageIcon, Italic, Link as LinkIcon, List,
  ListOrdered, ListTodo, Maximize, MessageSquarePlus, Minus, PanelLeft, PieChart, Pilcrow, Plus, Printer, Quote, Redo2, Ruler, Save,
  ScanSearch, Search, Shapes, Sigma, SpellCheck, Strikethrough, Subscript, Superscript, Table, TableOfContents, Underline, Undo2,
  Sparkles, XCircle, Code, Rows3, Columns3, Merge, Split, Trash2, Crop, Eraser, Footprints, ClipboardCheck } from "lucide-react";
import type { CitationStyle, PageLayout } from "@rsp/shared-types";
import { cx, Dropdown, IconButton, MenuItem } from "@rsp/ui-components";
import type { DialogKind } from "./dialogs";

const L = (a: string, e: string) => (document.documentElement.lang === "ar" ? a : e);
const FONTS = ["Amiri", "Cairo", "Noto Naskh Arabic", "Noto Sans Arabic", "Arial", "Times New Roman", "Courier New"];
const SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt", "32pt", "36pt", "48pt"];
const COLORS = ["#000000", "#334155", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777", "#ffffff"];
const HL = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e9d5ff"];

export interface RibbonProps {
  editor: Editor; layout: PageLayout; setLayout: (l: PageLayout) => void; open: (k: DialogKind, p?: any) => void;
  file: { save: () => void; saveAs: () => void; exportAs: (fmt: string) => void; print: () => void; newDoc: () => void; openDoc: () => void; importDoc: () => void };
  view: { zoom: number; setZoom: (z: number) => void; ruler: boolean; setRuler: (b: boolean) => void; nav: boolean; setNav: (b: boolean) => void;
    multi: boolean; setMulti: (b: boolean) => void; fullscreen: () => void };
  review: { track: boolean; setTrack: (b: boolean) => void; spell: boolean; setSpell: (b: boolean) => void; panel: (p: string) => void; aiGrammar: () => void };
  citationStyle: CitationStyle; setCitationStyle: (s: CitationStyle) => void; toggleAI: () => void; aiOpen: boolean;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col border-e border-slate-200 px-2 last:border-0 dark:border-navy-700">
      <div className="flex flex-1 flex-wrap items-center gap-0.5">{children}</div>
      <div className="mt-0.5 text-center text-[10px] text-slate-400">{label}</div>
    </div>
  );
}

function Big({ icon, label, onClick, active, testId }: { icon: ReactNode; label: string; onClick: () => void; active?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-pressed={active}
      className={cx("flex h-14 min-w-14 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-navy-700",
        active && "bg-primary-100 text-primary-700 dark:bg-primary-600/30")}>{icon}<span className="whitespace-nowrap">{label}</span></button>
  );
}

const i = "h-4 w-4";

export default function Ribbon(p: RibbonProps) {
  const { editor: e, layout, setLayout } = p;
  const [tab, setTab] = useState("home");
  const c = () => e.chain().focus();
  const tabs = [["file", L("ملف", "File")], ["home", L("الرئيسية", "Home")], ["insert", L("إدراج", "Insert")], ["layout", L("تخطيط", "Layout")],
    ["references", L("المراجع", "References")], ["review", L("مراجعة", "Review")], ["view", L("عرض", "View")]];
  const inTable = e.isActive("table");
  const heading = [1, 2, 3, 4].find((l) => e.isActive("heading", { level: l }));
  const style = e.getAttributes("textStyle");
  const setMargins = (v: number) => setLayout({ ...layout, margins_mm: { top: v, bottom: v, left: v, right: v } });
  return (
    <div className="border-b border-slate-200 bg-white dark:border-navy-700 dark:bg-navy-900" data-testid="ribbon"
      onMouseDown={(ev) => { if ((ev.target as HTMLElement).closest("button")) ev.preventDefault(); /* keep editor focus + selection */ }}>
      <div className="flex items-center gap-1 px-2" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`tab-${id}`}
            className={cx("rounded-t-md px-3 py-1.5 text-sm", tab === id ? "bg-slate-100 font-semibold text-primary-600 dark:bg-navy-800 dark:text-primary-400" : "text-slate-600 hover:text-slate-900 dark:text-slate-400")}>{label}</button>))}
        <div className="flex-1" />
        <button onClick={p.toggleAI} data-testid="toggle-ai" className={cx("flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium", p.aiOpen ? "bg-ai-600 text-white" : "text-ai-600 hover:bg-ai-50 dark:text-ai-400 dark:hover:bg-ai-600/10")}>
          <Sparkles className={i} />{L("المساعد الذكي", "AI Assistant")}</button>
      </div>
      <div className="flex min-h-[76px] items-stretch overflow-x-auto bg-slate-100 px-1 py-1 dark:bg-navy-800">
        {tab === "file" && <>
          <Group label={L("مستند", "Document")}>
            <Big icon={<FilePlus className="h-5 w-5" />} label={L("جديد", "New")} onClick={p.file.newDoc} />
            <Big icon={<FolderOpen className="h-5 w-5" />} label={L("فتح", "Open")} onClick={p.file.openDoc} />
            <Big icon={<FileInput className="h-5 w-5" />} label={L("استيراد Word", "Import Word")} onClick={p.file.importDoc} />
            <Big icon={<Save className="h-5 w-5" />} label={L("حفظ", "Save")} onClick={p.file.save} testId="btn-save" />
            <Big icon={<Copy className="h-5 w-5" />} label={L("حفظ باسم", "Save as")} onClick={p.file.saveAs} />
          </Group>
          <Group label={L("تصدير", "Export")}>
            <Big icon={<FileDown className="h-5 w-5 text-red-600" />} label="PDF" onClick={() => p.file.exportAs("pdf")} testId="export-pdf" />
            <Big icon={<FileText className="h-5 w-5 text-blue-600" />} label="Word" onClick={() => p.file.exportAs("docx")} testId="export-docx" />
            <Big icon={<Code className="h-5 w-5" />} label="HTML" onClick={() => p.file.exportAs("html")} />
            <Big icon={<Download className="h-5 w-5" />} label="Markdown" onClick={() => p.file.exportAs("md")} />
            <Big icon={<Download className="h-5 w-5" />} label="TXT" onClick={() => p.file.exportAs("txt")} />
          </Group>
          <Group label={L("طباعة", "Print")}><Big icon={<Printer className="h-5 w-5" />} label={L("معاينة وطباعة", "Preview & print")} onClick={p.file.print} testId="btn-print" /></Group>
          <Group label={L("الإصدارات", "Versions")}><Big icon={<History className="h-5 w-5" />} label={L("سجل الإصدارات", "Version history")} onClick={() => p.review.panel("versions")} /></Group>
        </>}
        {tab === "home" && <>
          <Group label={L("الحافظة", "Clipboard")}>
            <IconButton label={L("تراجع (Ctrl+Z)", "Undo (Ctrl+Z)")} onClick={() => c().undo().run()} disabled={!e.can().undo()}><Undo2 className={i} /></IconButton>
            <IconButton label={L("إعادة (Ctrl+Y)", "Redo (Ctrl+Y)")} onClick={() => c().redo().run()} disabled={!e.can().redo()}><Redo2 className={i} /></IconButton>
            <IconButton label={L("مسح التنسيق", "Clear formatting")} onClick={() => c().unsetAllMarks().clearNodes().run()}><Eraser className={i} /></IconButton>
          </Group>
          <Group label={L("الخط", "Font")}>
            <select aria-label="Font family" className="h-8 w-36 rounded border border-slate-300 bg-white px-1 text-sm dark:border-navy-700 dark:bg-navy-900" value={(style.fontFamily as string) || ""}
              onChange={(ev) => ev.target.value ? c().setFontFamily(ev.target.value).run() : c().unsetFontFamily().run()}>
              <option value="">{layout.fontFamily}</option>{FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select>
            <select aria-label="Font size" className="h-8 w-20 rounded border border-slate-300 bg-white px-1 text-sm dark:border-navy-700 dark:bg-navy-900" value={(style.fontSize as string) || ""}
              onChange={(ev) => ev.target.value ? c().setFontSize(ev.target.value).run() : c().unsetFontSize().run()}>
              <option value="">{layout.fontSize}pt</option>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>
            <IconButton label="Bold (Ctrl+B)" active={e.isActive("bold")} onClick={() => c().toggleBold().run()} data-testid="btn-bold"><Bold className={i} /></IconButton>
            <IconButton label="Italic (Ctrl+I)" active={e.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic className={i} /></IconButton>
            <IconButton label="Underline (Ctrl+U)" active={e.isActive("underline")} onClick={() => c().toggleUnderline().run()}><Underline className={i} /></IconButton>
            <IconButton label="Strike" active={e.isActive("strike")} onClick={() => c().toggleStrike().run()}><Strikethrough className={i} /></IconButton>
            <IconButton label="Subscript" active={e.isActive("subscript")} onClick={() => c().toggleSubscript().run()}><Subscript className={i} /></IconButton>
            <IconButton label="Superscript" active={e.isActive("superscript")} onClick={() => c().toggleSuperscript().run()}><Superscript className={i} /></IconButton>
            <Dropdown trigger={(o) => <IconButton label={L("لون الخط", "Font color")} onClick={o}><span className="font-bold" style={{ color: (style.color as string) || undefined, borderBottom: `3px solid ${style.color || "#000"}` }}>A</span></IconButton>}>
              {(close) => <div className="grid w-44 grid-cols-6 gap-1 p-2">{COLORS.map((col) => <button key={col} aria-label={col} className="h-6 w-6 rounded border" style={{ background: col }} onClick={() => { c().setColor(col).run(); close(); }} />)}
                <button className="col-span-6 text-xs" onClick={() => { c().unsetColor().run(); close(); }}>{L("تلقائي", "Automatic")}</button></div>}
            </Dropdown>
            <Dropdown trigger={(o) => <IconButton label={L("تمييز", "Highlight")} active={e.isActive("highlight")} onClick={o}><Highlighter className={i} /></IconButton>}>
              {(close) => <div className="grid w-40 grid-cols-6 gap-1 p-2">{HL.map((col) => <button key={col} aria-label={col} className="h-6 w-6 rounded border" style={{ background: col }} onClick={() => { c().toggleHighlight({ color: col }).run(); close(); }} />)}
                <button className="col-span-6 text-xs" onClick={() => { c().unsetHighlight().run(); close(); }}>{L("بدون", "None")}</button></div>}
            </Dropdown>
          </Group>
          <Group label={L("فقرة", "Paragraph")}>
            <IconButton label={L("محاذاة لليمين", "Align right")} active={e.isActive({ textAlign: "right" })} onClick={() => c().setTextAlign("right").run()}><AlignRight className={i} /></IconButton>
            <IconButton label={L("توسيط", "Center")} active={e.isActive({ textAlign: "center" })} onClick={() => c().setTextAlign("center").run()}><AlignCenter className={i} /></IconButton>
            <IconButton label={L("محاذاة لليسار", "Align left")} active={e.isActive({ textAlign: "left" })} onClick={() => c().setTextAlign("left").run()}><AlignLeft className={i} /></IconButton>
            <IconButton label={L("ضبط", "Justify")} active={e.isActive({ textAlign: "justify" })} onClick={() => c().setTextAlign("justify").run()}><AlignJustify className={i} /></IconButton>
            <IconButton label="RTL" active={e.getAttributes("paragraph").dir === "rtl"} onClick={() => c().setDirection("rtl").run()}><Pilcrow className={cx(i, "-scale-x-100")} /></IconButton>
            <IconButton label="LTR" active={e.getAttributes("paragraph").dir === "ltr"} onClick={() => c().setDirection("ltr").run()}><Pilcrow className={i} /></IconButton>
            <IconButton label={L("تعداد نقطي", "Bullets")} active={e.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List className={i} /></IconButton>
            <IconButton label={L("تعداد رقمي", "Numbering")} active={e.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered className={i} /></IconButton>
            <IconButton label={L("قائمة مهام", "Checklist")} active={e.isActive("taskList")} onClick={() => c().toggleTaskList().run()}><ListTodo className={i} /></IconButton>
            <IconButton label={L("اقتباس", "Quote")} active={e.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Quote className={i} /></IconButton>
            <select aria-label="Line height" className="h-8 w-20 rounded border border-slate-300 bg-white text-sm dark:border-navy-700 dark:bg-navy-900"
              value={e.getAttributes("paragraph").lineHeight || ""} onChange={(ev) => c().setLineHeight(ev.target.value).run()}>
              <option value="">↕ {layout.lineHeight}</option>{["1", "1.15", "1.5", "2", "2.5", "3"].map((v) => <option key={v}>{v}</option>)}</select>
            <select aria-label="Spacing after" className="h-8 w-20 rounded border border-slate-300 bg-white text-sm dark:border-navy-700 dark:bg-navy-900"
              value={e.getAttributes("paragraph").spacingAfter ?? ""} onChange={(ev) => c().setSpacingAfter(+ev.target.value).run()}>
              <option value="">¶ {L("بعد", "after")}</option>{[0, 3, 6, 12, 18, 24].map((v) => <option key={v} value={v}>{v}pt</option>)}</select>
          </Group>
          <Group label={L("الأنماط", "Styles")}>
            <select aria-label="Style" data-testid="style-select" className="h-8 w-32 rounded border border-slate-300 bg-white text-sm dark:border-navy-700 dark:bg-navy-900" value={heading ? `h${heading}` : e.isActive("codeBlock") ? "code" : "p"}
              onChange={(ev) => { const v = ev.target.value; v === "p" ? c().setParagraph().run() : v === "code" ? c().toggleCodeBlock().run() : c().toggleHeading({ level: +v[1] as any }).run(); }}>
              <option value="p">{L("نص عادي", "Normal")}</option><option value="h1">{L("عنوان 1", "Heading 1")}</option><option value="h2">{L("عنوان 2", "Heading 2")}</option>
              <option value="h3">{L("عنوان 3", "Heading 3")}</option><option value="h4">{L("عنوان 4", "Heading 4")}</option><option value="code">{L("كود", "Code")}</option></select>
          </Group>
          <Group label={L("تحرير", "Editing")}>
            <IconButton label={L("بحث (Ctrl+F)", "Find (Ctrl+F)")} onClick={() => p.open("find")}><Search className={i} /></IconButton>
          </Group>
        </>}
        {tab === "insert" && <>
          <Group label={L("صفحات", "Pages")}>
            <Big icon={<BookOpen className="h-5 w-5" />} label={L("غلاف", "Cover")} onClick={() => c().insertContentAt(0, { type: "coverPage", attrs: { title: "" } }).run()} />
            <Big icon={<Minus className="h-5 w-5" />} label={L("فاصل صفحة", "Page break")} onClick={() => c().setPageBreak().run()} testId="ins-pagebreak" />
          </Group>
          <Group label={L("جداول ورسوم", "Tables & media")}>
            <Big icon={<Table className="h-5 w-5" />} label={L("جدول", "Table")} onClick={() => p.open("table")} testId="ins-table" />
            <Big icon={<ImageIcon className="h-5 w-5" />} label={L("صورة", "Image")} onClick={() => p.open("image")} testId="ins-image" />
            <Big icon={<Shapes className="h-5 w-5" />} label={L("أشكال", "Shapes")} onClick={() => p.open("shape")} />
            <Big icon={<PieChart className="h-5 w-5" />} label={L("رسم بياني", "Chart")} onClick={() => p.open("chart")} />
            <Big icon={<Sigma className="h-5 w-5" />} label={L("معادلة", "Equation")} onClick={() => p.open("equation")} />
          </Group>
          <Group label={L("روابط", "Links")}>
            <Big icon={<LinkIcon className="h-5 w-5" />} label={L("ارتباط", "Link")} onClick={() => p.open("link")} />
            <Big icon={<Footprints className="h-5 w-5" />} label={L("حاشية", "Footnote")} onClick={() => p.open("footnote")} />
            <Big icon={<Minus className="h-5 w-5" />} label={L("خط أفقي", "Rule")} onClick={() => c().setHorizontalRule().run()} />
          </Group>
          <Group label={L("ترويسة وتذييل", "Header & footer")}>
            <Big icon={<Heading className="h-5 w-5" />} label={L("ترويسة/تذييل", "Header/Footer")} onClick={() => p.open("headerFooter")} />
            <Big icon={<ListOrdered className="h-5 w-5" />} label={L("أرقام الصفحات", "Page numbers")} onClick={() => p.open("headerFooter")} />
          </Group>
        </>}
        {tab === "layout" && <>
          <Group label={L("حجم الورق", "Size")}>
            {(["A4", "A3", "Letter"] as const).map((s) => <Big key={s} icon={<FileText className="h-5 w-5" />} label={s} active={layout.pageSize === s} onClick={() => setLayout({ ...layout, pageSize: s })} testId={`size-${s}`} />)}
            <Big icon={<FileText className="h-5 w-5" />} label={L("مخصص", "Custom")} active={layout.pageSize === "Custom"} onClick={() => p.open("pageSetup")} />
          </Group>
          <Group label={L("الاتجاه", "Orientation")}>
            <Big icon={<Rows3 className="h-5 w-5" />} label={L("عمودي", "Portrait")} active={layout.orientation === "portrait"} onClick={() => setLayout({ ...layout, orientation: "portrait" })} />
            <Big icon={<Columns3 className="h-5 w-5" />} label={L("أفقي", "Landscape")} active={layout.orientation === "landscape"} onClick={() => setLayout({ ...layout, orientation: "landscape" })} testId="landscape" />
          </Group>
          <Group label={L("الهوامش", "Margins")}>
            <Big icon={<ScanSearch className="h-5 w-5" />} label={L("عادي 25مم", "Normal 25mm")} onClick={() => setMargins(25)} />
            <Big icon={<ScanSearch className="h-5 w-5" />} label={L("ضيق 12.7", "Narrow 12.7")} onClick={() => setMargins(12.7)} />
            <Big icon={<ScanSearch className="h-5 w-5" />} label={L("عريض 38", "Wide 38")} onClick={() => setMargins(38)} />
            <Big icon={<ScanSearch className="h-5 w-5" />} label={L("مخصص", "Custom")} onClick={() => p.open("pageSetup")} />
          </Group>
          <Group label={L("أعمدة وحدود", "Columns & borders")}>
            {[1, 2, 3].map((n) => <Big key={n} icon={<Columns2 className="h-5 w-5" />} label={`${n} ${L("عمود", "col")}`} active={layout.columns === n} onClick={() => setLayout({ ...layout, columns: n })} />)}
            <Big icon={<FileText className="h-5 w-5" />} label={L("حدود الصفحة", "Page border")} active={layout.pageBorder} onClick={() => setLayout({ ...layout, pageBorder: !layout.pageBorder })} />
          </Group>
          <Group label={L("المستند", "Document")}>
            <Big icon={<Pilcrow className="h-5 w-5" />} label={layout.direction === "rtl" ? "RTL" : "LTR"} onClick={() => setLayout({ ...layout, direction: layout.direction === "rtl" ? "ltr" : "rtl" })} />
            <Big icon={<FileText className="h-5 w-5" />} label={L("إعداد الصفحة", "Page setup")} onClick={() => p.open("pageSetup")} />
          </Group>
        </>}
        {tab === "references" && <>
          <Group label={L("الاستشهادات", "Citations")}>
            <Big icon={<Quote className="h-5 w-5" />} label={L("إدراج استشهاد", "Insert citation")} onClick={() => p.open("citation")} testId="ins-citation" />
            <div className="flex flex-col justify-center px-1">
              <select aria-label="Citation style" className="h-8 rounded border border-slate-300 bg-white text-sm dark:border-navy-700 dark:bg-navy-900" value={p.citationStyle} onChange={(ev) => p.setCitationStyle(ev.target.value as CitationStyle)}>
                {["apa", "ieee", "mla", "chicago", "harvard", "vancouver"].map((s) => <option key={s} value={s}>{s === "apa" ? "APA 7" : s.toUpperCase()}</option>)}</select>
            </div>
            <Big icon={<BookOpen className="h-5 w-5" />} label={L("قائمة المراجع", "Bibliography")} onClick={() => c().insertBlock("bibliography").run()} />
          </Group>
          <Group label={L("الفهارس", "Tables")}>
            <Big icon={<TableOfContents className="h-5 w-5" />} label={L("جدول المحتويات", "Table of contents")} onClick={() => c().insertBlock("tableOfContents").run()} />
            <Big icon={<ImageIcon className="h-5 w-5" />} label={L("قائمة الأشكال", "Figure list")} onClick={() => c().insertBlock("figureList").run()} />
            <Big icon={<Table className="h-5 w-5" />} label={L("قائمة الجداول", "Table list")} onClick={() => c().insertBlock("tableList").run()} />
          </Group>
          <Group label={L("الحواشي", "Notes")}>
            <Big icon={<Footprints className="h-5 w-5" />} label={L("حاشية سفلية", "Footnote")} onClick={() => p.open("footnote")} />
            <Big icon={<Footprints className="h-5 w-5" />} label={L("تعليق ختامي", "Endnote")} onClick={() => p.open("footnote")} />
          </Group>
        </>}
        {tab === "review" && <>
          <Group label={L("التدقيق", "Proofing")}>
            <Big icon={<SpellCheck className="h-5 w-5" />} label={L("تدقيق إملائي", "Spell check")} active={p.review.spell} onClick={() => p.review.setSpell(!p.review.spell)} />
            <Big icon={<Sparkles className="h-5 w-5 text-ai-500" />} label={L("تدقيق نحوي (AI)", "Grammar (AI)")} onClick={p.review.aiGrammar} />
            <Big icon={<ClipboardCheck className="h-5 w-5" />} label={L("جودة الكتابة", "Quality check")} onClick={() => p.review.panel("review")} />
          </Group>
          <Group label={L("تعليقات", "Comments")}>
            <Big icon={<MessageSquarePlus className="h-5 w-5" />} label={L("تعليق جديد", "New comment")} onClick={() => p.review.panel("comments:new")} />
            <Big icon={<MessageSquarePlus className="h-5 w-5" />} label={L("التعليقات", "Comments")} onClick={() => p.review.panel("comments")} />
          </Group>
          <Group label={L("التعقب", "Tracking")}>
            <Big icon={<Pilcrow className="h-5 w-5" />} label={L("تعقب التغييرات", "Track changes")} active={p.review.track} onClick={() => p.review.setTrack(!p.review.track)} testId="track-changes" />
            <Big icon={<CheckCheck className="h-5 w-5 text-success" />} label={L("قبول الكل", "Accept all")} onClick={() => c().acceptAllChanges().run()} />
            <Big icon={<XCircle className="h-5 w-5 text-danger" />} label={L("رفض الكل", "Reject all")} onClick={() => c().rejectAllChanges().run()} />
          </Group>
          <Group label={L("مقارنة", "Compare")}>
            <Big icon={<GitCompare className="h-5 w-5" />} label={L("مقارنة المستندات", "Compare documents")} onClick={() => p.review.panel("compare")} />
            <Big icon={<Search className="h-5 w-5" />} label={L("بحث واستبدال", "Find & replace")} onClick={() => p.open("find")} />
          </Group>
        </>}
        {tab === "view" && <>
          <Group label={L("التكبير", "Zoom")}>
            <IconButton label="Zoom out" onClick={() => p.view.setZoom(Math.max(0.3, +(p.view.zoom - 0.1).toFixed(2)))}><Minus className={i} /></IconButton>
            <span className="w-12 text-center text-sm" data-testid="zoom">{Math.round(p.view.zoom * 100)}%</span>
            <IconButton label="Zoom in" onClick={() => p.view.setZoom(Math.min(3, +(p.view.zoom + 0.1).toFixed(2)))}><Plus className={i} /></IconButton>
            <IconButton label="100%" onClick={() => p.view.setZoom(1)}>100%</IconButton>
          </Group>
          <Group label={L("العرض", "Views")}>
            <Big icon={<FileText className="h-5 w-5" />} label={L("صفحة واحدة", "Single page")} active={!p.view.multi} onClick={() => p.view.setMulti(false)} />
            <Big icon={<Columns2 className="h-5 w-5" />} label={L("صفحات متعددة", "Multiple pages")} active={p.view.multi} onClick={() => p.view.setMulti(true)} />
            <Big icon={<Ruler className="h-5 w-5" />} label={L("المسطرة", "Ruler")} active={p.view.ruler} onClick={() => p.view.setRuler(!p.view.ruler)} />
            <Big icon={<PanelLeft className="h-5 w-5" />} label={L("التنقل", "Navigation")} active={p.view.nav} onClick={() => p.view.setNav(!p.view.nav)} />
            <Big icon={<Maximize className="h-5 w-5" />} label={L("ملء الشاشة", "Full screen")} onClick={p.view.fullscreen} />
          </Group>
        </>}
        {inTable && (tab === "home" || tab === "insert") && (
          <Group label={L("أدوات الجدول", "Table tools")}>
            <IconButton label={L("صف أعلى", "Row above")} onClick={() => c().addRowBefore().run()}><Rows3 className={i} />↑</IconButton>
            <IconButton label={L("صف أسفل", "Row below")} onClick={() => c().addRowAfter().run()}><Rows3 className={i} />↓</IconButton>
            <IconButton label={L("عمود قبل", "Column before")} onClick={() => c().addColumnBefore().run()}><Columns3 className={i} />←</IconButton>
            <IconButton label={L("عمود بعد", "Column after")} onClick={() => c().addColumnAfter().run()}><Columns3 className={i} />→</IconButton>
            <IconButton label={L("حذف صف", "Delete row")} onClick={() => c().deleteRow().run()}><Rows3 className={i} />✕</IconButton>
            <IconButton label={L("حذف عمود", "Delete column")} onClick={() => c().deleteColumn().run()}><Columns3 className={i} />✕</IconButton>
            <IconButton label={L("دمج الخلايا", "Merge cells")} onClick={() => c().mergeCells().run()} disabled={!e.can().mergeCells()}><Merge className={i} /></IconButton>
            <IconButton label={L("تقسيم الخلية", "Split cell")} onClick={() => c().splitCell().run()} disabled={!e.can().splitCell()}><Split className={i} /></IconButton>
            <IconButton label={L("صف العناوين", "Header row")} onClick={() => c().toggleHeaderRow().run()}><Heading className={i} /></IconButton>
            <Dropdown trigger={(o) => <IconButton label={L("لون الخلية", "Cell color")} onClick={o}><span className="h-4 w-4 rounded border bg-amber-200" /></IconButton>}>
              {(close) => <div className="grid w-44 grid-cols-6 gap-1 p-2">{["#ffffff", "#dbeafe", "#dcfce7", "#fef3c7", "#fee2e2", "#ede9fe", "#e2e8f0", "#1e3a8a"].map((col) =>
                <button key={col} aria-label={col} className="h-6 w-6 rounded border" style={{ background: col }} onClick={() => { c().setCellAttribute("backgroundColor", col).run(); close(); }} />)}</div>}
            </Dropdown>
            <Dropdown trigger={(o) => <IconButton label={L("الحدود", "Borders")} onClick={o}><Table className={i} /></IconButton>}>
              {(close) => <>{[["all", L("كل الحدود", "All borders")], ["outer", L("حدود خارجية", "Outer only")], ["none", L("بدون حدود", "No borders")]].map(([v, lab]) =>
                <MenuItem key={v} onClick={() => { c().updateAttributes("table", { borders: v }).run(); close(); }}>{lab}</MenuItem>)}
                <MenuItem onClick={() => { const cap = prompt(L("تعليق الجدول", "Table caption"), e.getAttributes("table").caption || ""); if (cap != null) c().updateAttributes("table", { caption: cap }).run(); close(); }}>{L("التعليق التوضيحي…", "Caption…")}</MenuItem></>}
            </Dropdown>
            <IconButton label={L("حذف الجدول", "Delete table")} onClick={() => c().deleteTable().run()}><Trash2 className={cx(i, "text-danger")} /></IconButton>
          </Group>)}
        {e.isActive("image") && (tab === "home" || tab === "insert") && (
          <Group label={L("أدوات الصورة", "Image tools")}>
            {["25%", "50%", "75%", "100%"].map((w) => <IconButton key={w} label={w} active={e.getAttributes("image").width === w} onClick={() => c().updateAttributes("image", { width: w }).run()}><span className="text-xs">{w}</span></IconButton>)}
            <IconButton label={L("يمين", "Right")} onClick={() => c().updateAttributes("image", { align: "right" }).run()}><AlignRight className={i} /></IconButton>
            <IconButton label={L("وسط", "Center")} onClick={() => c().updateAttributes("image", { align: "center" }).run()}><AlignCenter className={i} /></IconButton>
            <IconButton label={L("يسار", "Left")} onClick={() => c().updateAttributes("image", { align: "left" }).run()}><AlignLeft className={i} /></IconButton>
            <IconButton label={L("قص", "Crop")} onClick={() => p.open("crop")}><Crop className={i} /></IconButton>
            <IconButton label={L("تعليق", "Caption")} onClick={() => { const cap = prompt(L("تعليق الصورة", "Image caption"), e.getAttributes("image").caption || ""); if (cap != null) c().updateAttributes("image", { caption: cap }).run(); }}><Quote className={i} /></IconButton>
          </Group>)}
      </div>
    </div>
  );
}
