import { Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@rsp/ui-components";
import { useEffect } from "react";
import { useAuth } from "./lib/auth";
import { sync } from "./lib/sync";
import AppShell from "./components/AppShell";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import ReportsPage from "./pages/ReportsPage";
import ProjectsPage from "./pages/ProjectsPage";
import NewReportWizard from "./pages/NewReportWizard";
import TemplatesPage from "./pages/TemplatesPage";
import ReferencesPage from "./pages/ReferencesPage";
import SourcesPage from "./pages/SourcesPage";
import SettingsPage from "./pages/SettingsPage";
import EditorPage from "./editor/EditorPage";

export default function App() {
  const { user, loading } = useAuth();
  useEffect(() => (user ? sync.start() : undefined), [user]);
  if (loading) return <div className="flex h-full items-center justify-center"><Spinner className="h-8 w-8" /></div>;
  if (!user) return <AuthPage />;
  return (
    <Routes>
      <Route path="/editor/:id" element={<EditorPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectsPage />} />
        <Route path="/new" element={<NewReportWizard />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/references" element={<ReferencesPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
  );
}
