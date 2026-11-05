import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const Theme = createContext<{ theme: "dark" | "light"; toggle: () => void; setTheme: (t: "dark" | "light") => void }>(null as any);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("rsp.theme") as any) ||
    (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark"));
  useEffect(() => {
    localStorage.setItem("rsp.theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return <Theme.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>{children}</Theme.Provider>;
}
export const useTheme = () => useContext(Theme);
