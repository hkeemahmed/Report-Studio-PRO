import templates from "../templates.json";
import type { DocNode, ReportMeta, TemplateDef } from "@rsp/shared-types";

export const BUILTIN_TEMPLATES = templates as unknown as TemplateDef[];

/** Build the initial Tiptap document for a template + wizard metadata. */
export function buildDocumentFromTemplate(tpl: TemplateDef, meta: ReportMeta, sectionTitles?: string[]): DocNode {
  const lang = meta.language === "en" ? "en" : "ar";
  const heads = sectionTitles ?? tpl.structure.map((s) => s[lang]);
  const content: DocNode[] = [
    { type: "coverPage", attrs: { title: meta.title, author: meta.author, university: meta.university,
      department: meta.department, stage: meta.stage, supervisor: meta.supervisor, date: meta.date } },
  ];
  const toc = tpl.includeToc ?? tpl.layout?.includeToc ?? true;
  const bib = tpl.includeBibliography ?? tpl.layout?.includeBibliography ?? true;
  if (toc) content.push({ type: "tableOfContents" }, { type: "pageBreak" });
  for (const h of heads) {
    content.push({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: h }] });
    content.push({ type: "paragraph" });
  }
  if (bib) content.push({ type: "pageBreak" }, { type: "bibliography" });
  return { type: "doc", content };
}
