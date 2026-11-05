export type UUID = string;
export type Lang = "ar" | "en";
export type Role = "owner" | "admin" | "editor" | "viewer";

export interface DocNode {
  type: string;
  attrs?: Record<string, any>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
}

export interface Margins { top: number; bottom: number; left: number; right: number }
export interface HeaderFooter { text: string; align: "left" | "center" | "right" }
export interface PageNumbers { enabled: boolean; position: "header" | "footer"; align: "left" | "center" | "right"; format: "arabic" | "arabic-indic" | "roman"; start: number }

export interface PageLayout {
  pageSize: "A4" | "A3" | "A5" | "Letter" | "Legal" | "Custom";
  width_mm: number; height_mm: number;
  orientation: "portrait" | "landscape";
  margins_mm: Margins;
  columns: number; pageBorder: boolean;
  header: HeaderFooter; footer: HeaderFooter; pageNumbers: PageNumbers;
  direction: "rtl" | "ltr"; fontFamily: string; fontSize: number; lineHeight: number;
  headingColor: string; differentFirstPage: boolean; citationStyle?: CitationStyle;
  includeToc?: boolean; includeBibliography?: boolean;
}

export type CitationStyle = "apa" | "ieee" | "mla" | "chicago" | "harvard" | "vancouver";
export type DocStatus = "draft" | "in_progress" | "completed";

export interface ReportMeta {
  title: string; author?: string; university?: string; college?: string; department?: string; stage?: string;
  supervisor?: string; date?: string; language: Lang;
}

export interface DocumentSummary {
  id: UUID; workspace_id: UUID; project_id: UUID | null; folder_id: UUID | null; title: string; report_type: string;
  language: Lang; status: DocStatus; is_favorite: boolean; version: number; created_at: string; updated_at: string; tags: string[];
}
export interface ReportDocument extends DocumentSummary {
  template_id: UUID | null; metadata: Record<string, any>; content: DocNode; layout: PageLayout;
}
export interface Version { id: UUID; version: number; title: string; label: string; created_at: string }

export interface Project {
  id: UUID; workspace_id: UUID; name: string; description: string; category: string; is_archived: boolean;
  is_favorite: boolean; created_at: string; updated_at: string; document_count: number;
}
export interface Folder { id: UUID; project_id: UUID; parent_id: UUID | null; name: string }

export interface TemplateSection { ar: string; en: string }
export interface TemplateDef {
  id?: UUID; slug: string; category: string; name: string; name_ar: string; structure: TemplateSection[];
  layout: Partial<PageLayout> & Record<string, any>; styles: Record<string, Record<string, any>>;
  includeToc?: boolean; includeBibliography?: boolean; is_builtin?: boolean;
}

export interface Author { given: string; family: string }
export interface Source {
  id: UUID; workspace_id?: UUID; project_id?: UUID | null; source_type: string; title: string; authors: Author[];
  year: string; doi: string; isbn: string; data: Record<string, string>; cite_key: string;
}

export interface Provider {
  id: string; name: string; type: "openai" | "openai_compatible" | "ollama" | "anthropic"; base_url: string; model: string;
  embedding_model: string; is_default: boolean; has_api_key: boolean; monthly_token_limit: number;
}
export interface AIResult {
  text: string; provider: string; model: string; prompt_tokens: number; completion_tokens: number;
  sources: { id: string; asset_id: string; filename: string; page: number; excerpt: string; score: number }[]; retrieval: string;
}
export interface Asset {
  id: UUID; kind: "image" | "source"; filename: string; mime_type: string; size_bytes: number; document_id: UUID | null;
  created_at: string; indexed: boolean; chunk_count: number; embedded: boolean; text_chars: number;
}
export interface Workspace { id: UUID; name: string; owner_id: UUID; role: Role; ai_monthly_token_limit: number }
export interface User { id: UUID; email: string; full_name: string; locale: Lang; settings: Record<string, any> }

export interface DiffOp { op: "equal" | "insert" | "delete"; text: string }
export interface DiffResult { similarity: number; ops: DiffOp[]; stats: { inserted: number; deleted: number } }
