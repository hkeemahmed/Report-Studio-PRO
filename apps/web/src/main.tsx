import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ToastProvider } from "@rsp/ui-components";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import { AuthProvider } from "./lib/auth";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider><ThemeProvider><ToastProvider><AuthProvider>
      <HashRouter><App /></HashRouter>
    </AuthProvider></ToastProvider></ThemeProvider></I18nProvider>
  </React.StrictMode>,
);
