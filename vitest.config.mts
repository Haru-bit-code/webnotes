import { defineConfig } from "vitest/config";
import path from "node:path";
// Unit tests for the app's logic (no browser needed): npm test
export default defineConfig({
  esbuild: { jsx: "automatic" }, // the app compiles JSX through Next.js; tests need it too
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "jsdom" },
});
