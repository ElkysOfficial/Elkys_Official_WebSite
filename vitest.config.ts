import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Config dedicada de testes unitarios — separada do vite.config.ts pra nao
 * carregar plugins de build (PurgeCSS, SVGR, manualChunks) durante testes.
 *
 * Foco: funcoes puras em src/lib/. Componentes React e integracoes ficam
 * com Playwright (e2e/).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
    coverage: {
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts"],
    },
  },
});
