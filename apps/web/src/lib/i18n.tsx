import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const dict = {
  appName: ["Report Studio PRO", "Report Studio PRO"],
  dashboard: ["لوحة التحكم", "Dashboard"], reports: ["التقارير", "Reports"], projects: ["المشاريع", "Projects"],
  templates: ["القوالب", "Templates"], references: ["المراجع", "References"], sources: ["مصادر البحث", "Research Sources"],
  settings: ["الإعدادات", "Settings"], newReport: ["تقرير جديد", "New Report"], logout: ["تسجيل الخروج", "Log out"],
  login: ["تسجيل الدخول", "Sign in"], register: ["إنشاء حساب", "Create account"], email: ["البريد الإلكتروني", "Email"],
  password: ["كلمة المرور", "Password"], fullName: ["الاسم الكامل", "Full name"], noAccount: ["ليس لديك حساب؟", "No account?"],
  haveAccount: ["لديك حساب؟", "Have an account?"], serverUrl: ["عنوان الخادم", "Server URL"],
  totalReports: ["إجمالي التقارير", "Total reports"], completed: ["المكتملة", "Completed"], inProgress: ["قيد العمل", "In progress"],
  aiRequests: ["طلبات الذكاء الاصطناعي (30 يوماً)", "AI requests (30 days)"], recentReports: ["التقارير الأخيرة", "Recent reports"],
  favorites: ["المفضلة", "Favorites"], recentTemplates: ["القوالب الأخيرة", "Recent templates"], notifications: ["الإشعارات", "Notifications"],
  quickSearch: ["بحث سريع في التقارير…", "Quick search reports…"], none: ["لا يوجد شيء بعد", "Nothing yet"],
  save: ["حفظ", "Save"], cancel: ["إلغاء", "Cancel"], delete: ["حذف", "Delete"], edit: ["تعديل", "Edit"], create: ["إنشاء", "Create"],
  close: ["إغلاق", "Close"], open: ["فتح", "Open"], next: ["التالي", "Next"], back: ["السابق", "Back"], search: ["بحث", "Search"],
  name: ["الاسم", "Name"], description: ["الوصف", "Description"], category: ["التصنيف", "Category"], archive: ["أرشفة", "Archive"],
  unarchive: ["إلغاء الأرشفة", "Unarchive"], archived: ["المؤرشفة", "Archived"], favorite: ["مفضلة", "Favorite"],
  status: ["الحالة", "Status"], draft: ["مسودة", "Draft"], in_progress: ["قيد العمل", "In progress"], updated: ["آخر تحديث", "Updated"],
  confirmDelete: ["هل أنت متأكد من الحذف؟ لا يمكن التراجع.", "Are you sure? This cannot be undone."],
  duplicate: ["نسخ", "Duplicate"], tags: ["الوسوم", "Tags"], folders: ["المجلدات", "Folders"], newFolder: ["مجلد جديد", "New folder"],
  newProject: ["مشروع جديد", "New project"], importDoc: ["استيراد ملف Word", "Import Word file"], documentsCount: ["تقارير", "reports"],
  // wizard
  step: ["الخطوة", "Step"], reportInfo: ["معلومات التقرير", "Report information"], reportType: ["نوع التقرير", "Report type"],
  chooseTemplate: ["اختيار القالب", "Choose template"], targetPages: ["عدد الصفحات المستهدف", "Target pages"],
  structure: ["هيكل التقرير", "Report structure"], createOpen: ["إنشاء وفتح في المحرر", "Create & open in editor"],
  title: ["عنوان التقرير", "Report title"], author: ["اسم الطالب / المعدّ", "Student / author name"],
  university: ["الجامعة أو المدرسة", "University or school"], department: ["القسم", "Department"], stage: ["المرحلة الدراسية", "Academic stage"],
  supervisor: ["الأستاذ أو المشرف", "Supervisor"], date: ["التاريخ", "Date"], language: ["اللغة", "Language"],
  arabic: ["العربية", "Arabic"], english: ["الإنجليزية", "English"], project: ["المشروع", "Project"], noProject: ["بدون مشروع", "No project"],
  addSection: ["إضافة قسم", "Add section"], aiStructure: ["اقتراح الهيكل بالذكاء الاصطناعي", "Suggest structure with AI"],
  pagesHint: ["يُستخدم لتوجيه الذكاء الاصطناعي عند توليد المحتوى", "Used to guide AI content generation"],
  // types
  t_academic: ["أكاديمي", "Academic"], t_scientific: ["علمي", "Scientific"], t_engineering: ["هندسي", "Engineering"], t_medical: ["طبي", "Medical"],
  t_technical: ["تقني", "Technical"], t_cybersecurity: ["أمن سيبراني", "Cybersecurity"], t_business: ["إداري / أعمال", "Business"],
  t_financial: ["مالي", "Financial"], t_school: ["مدرسي", "School"], t_research: ["بحثي", "Research"],
  t_graduation: ["مشروع تخرج", "Graduation project"], t_laboratory: ["تقرير مختبر", "Laboratory report"], t_custom: ["مخصص", "Custom"],
  // settings
  account: ["الحساب", "Account"], aiProviders: ["مزودو الذكاء الاصطناعي", "AI providers"], usage: ["الاستهلاك", "Usage"],
  members: ["أعضاء مساحة العمل", "Workspace members"], appearance: ["المظهر", "Appearance"], dark: ["داكن", "Dark"], light: ["فاتح", "Light"],
  sync: ["المزامنة والعمل دون اتصال", "Sync & offline"], testConnection: ["اختبار الاتصال", "Test connection"],
  setDefault: ["افتراضي", "Default"], addProvider: ["إضافة مزود", "Add provider"], apiKey: ["مفتاح API", "API key"],
  baseUrl: ["عنوان الخادم", "Server URL"], model: ["النموذج", "Model"], embeddingModel: ["نموذج التضمين (للبحث الدلالي)", "Embedding model (semantic search)"],
  keyStored: ["المفتاح مخزّن ومشفّر على الخادم", "Key stored encrypted on server"], monthlyLimit: ["حد التوكنات الشهري (0 = بلا حد)", "Monthly token limit (0 = none)"],
  offline: ["غير متصل — يتم الحفظ محلياً", "Offline — saving locally"], online: ["متصل", "Online"], saved: ["تم الحفظ", "Saved"],
  saving: ["جارٍ الحفظ…", "Saving…"], unsaved: ["تعديلات غير محفوظة", "Unsaved changes"], pendingSync: ["بانتظار المزامنة", "Pending sync"],
  conflict: ["تعارض في النسخ", "Version conflict"], syncNow: ["مزامنة الآن", "Sync now"],
  words: ["كلمة", "words"], pages: ["صفحات", "pages"], chars: ["حرف", "characters"],
};

export type Key = keyof typeof dict;
type Ctx = { lang: "ar" | "en"; setLang: (l: "ar" | "en") => void; t: (k: Key | string) => string; dir: "rtl" | "ltr" };
const I18n = createContext<Ctx>(null as any);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<"ar" | "en">(() => (localStorage.getItem("rsp.lang") as any) || "ar");
  useEffect(() => {
    localStorage.setItem("rsp.lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const t = (k: string) => ((dict as any)[k]?.[lang === "ar" ? 0 : 1] ?? k);
  return <I18n.Provider value={{ lang, setLang, t, dir: lang === "ar" ? "rtl" : "ltr" }}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
