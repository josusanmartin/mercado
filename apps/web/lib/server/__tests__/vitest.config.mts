// Run from repo root: npx vitest run --config apps/web/lib/server/__tests__/vitest.config.mts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: webRoot,
  resolve: { alias: { "@": webRoot } },
  test: {
    include: ["lib/server/__tests__/**/*.test.ts"],
    environment: "node",
    setupFiles: ["lib/server/__tests__/setup.ts"],
    testTimeout: 30_000,
  },
});
