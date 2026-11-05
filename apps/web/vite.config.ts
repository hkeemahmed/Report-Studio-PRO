import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}/src`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@rsp/shared-types": pkg("shared-types"), "@rsp/document-schema": pkg("document-schema"),
      "@rsp/editor-core": pkg("editor-core"), "@rsp/ui-components": pkg("ui-components"),
      "@rsp/template-engine": pkg("template-engine"),
    },
  },
  server: { port: 5173, strictPort: true },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2021", chunkSizeWarningLimit: 2000 },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"], include: ["src/**/*.test.{ts,tsx}", "../../packages/*/src/**/*.test.{ts,tsx}"] },
} as any);
