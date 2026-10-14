// Run from repo root: npx vitest run --config apps/web/lib/contracts/__tests__/vitest.config.mts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root: webRoot,
  resolve: { alias: { "@": webRoot } },
  test: { include: ["lib/contracts/__tests__/**/*.test.ts"], environment: "node", testTimeout: 30_000 },
});
