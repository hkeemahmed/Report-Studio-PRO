/** Design System tokens: colors, typography, spacing, radii. */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/*/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#0b1220", 900: "#0f172a", 850: "#131c2f", 800: "#1a2438", 700: "#243049" },
        primary: { 50: "#eff6ff", 100: "#dbeafe", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8" },
        ai: { 50: "#f5f3ff", 100: "#ede9fe", 400: "#a78bfa", 500: "#8b5cf6", 600: "#7c3aed", 700: "#6d28d9" },
        success: "#16a34a", warning: "#d97706", danger: "#dc2626", info: "#0891b2",
      },
      fontFamily: {
        ui: ["Cairo", "Noto Sans Arabic", "Segoe UI", "system-ui", "sans-serif"],
        doc: ["Amiri", "Noto Naskh Arabic", "Times New Roman", "serif"],
      },
      boxShadow: { page: "0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(15,23,42,.18)" },
    },
  },
  plugins: [],
};
