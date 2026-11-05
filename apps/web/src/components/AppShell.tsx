import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { BookMarked, ChevronsLeft, ChevronsRight, FileText, FolderKanban, LayoutDashboard, LayoutTemplate, LogOut, Moon,
  Plus, Search, Settings, Sun, Library, Languages, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button, cx, IconButton } from "@rsp/ui-components";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { sync, useSyncState } from "../lib/sync";
import ConflictCenter from "./ConflictCenter";

export default function AppShell() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("rsp.sidebar") === "1");
  const [q, setQ] = useState("");
  const s = useSyncState();
  const items = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), end: true },
    { to: "/reports", icon: FileText, label: t("reports") },
    { to: "/projects", icon: FolderKanban, label: t("projects") },
    { to: "/templates", icon: LayoutTemplate, label: t("templates") },
    { to: "/references", icon: BookMarked, label: t("references") },
    { to: "/sources", icon: Library, label: t("sources") },
    { to: "/settings", icon: Settings, label: t("settings") },
  ];
  const Collapse = (lang === "ar") !== collapsed ? ChevronsRight : ChevronsLeft;
  return (
    <div className="flex h-full">
      <aside className={cx("flex shrink-0 flex-col border-e border-slate-200 bg-white transition-[width] duration-200 dark:border-navy-700 dark:bg-navy-900", collapsed ? "w-16" : "w-60")}>
        <div className="flex h-14 items-center gap-2 px-3">
          <img src="/favicon.svg" className="h-8 w-8" alt="" />
          {!collapsed && <span className="truncate font-bold">Report Studio <span className="text-primary-500">PRO</span></span>}
        </div>
        <div className="px-3 pb-3">
          <Button className="w-full" onClick={() => nav("/new")} icon={<Plus className="h-4 w-4" />} title={t("newReport")}>{!collapsed && t("newReport")}</Button>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} title={i.label}
              className={({ isActive }) => cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-primary-50 text-primary-700 dark:bg-primary-600/20 dark:text-primary-100" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800")}>
              <i.icon className="h-5 w-5 shrink-0" />{!collapsed && <span className="truncate">{i.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-2 dark:border-navy-700">
          {!collapsed && <div className="truncate px-2 pb-2 text-xs text-slate-500">{user?.email}</div>}
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-navy-800">
            <LogOut className="h-5 w-5" />{!collapsed && t("logout")}</button>
          <button onClick={() => { setCollapsed(!collapsed); localStorage.setItem("rsp.sidebar", collapsed ? "0" : "1"); }}
            className="flex w-full items-center justify-center rounded-lg py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-800" aria-label="Toggle sidebar">
            <Collapse className="h-5 w-5" /></button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 dark:border-navy-700 dark:bg-navy-900">
          <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); nav(`/reports?q=${encodeURIComponent(q)}`); }}>
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("quickSearch")} aria-label={t("search")}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 ps-9 pe-3 text-sm focus:border-primary-500 focus:outline-none dark:border-navy-700 dark:bg-navy-850" />
          </form>
          <div className="flex-1" />
          <span className={cx("flex items-center gap-1 text-xs", s.online ? "text-success" : "text-warning")} title={s.online ? t("online") : t("offline")}>
            {s.online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {s.pending > 0 && <span>{s.pending} {t("pendingSync")}</span>}
          </span>
          {s.pending > 0 && <IconButton label={t("syncNow")} onClick={() => sync.flush()}><RefreshCw className="h-4 w-4" /></IconButton>}
          <ConflictCenter conflicts={s.conflicts} />
          <IconButton label="Language" onClick={() => setLang(lang === "ar" ? "en" : "ar")}><Languages className="h-4 w-4" /><span className="ms-1 text-xs">{lang === "ar" ? "EN" : "ع"}</span></IconButton>
          <IconButton label={theme === "dark" ? t("light") : t("dark")} onClick={toggle}>{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</IconButton>
        </header>
        <main className="flex-1 overflow-auto p-6"><Outlet /></main>
      </div>
    </div>
  );
}
