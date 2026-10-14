import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev "N" badge out of demo recordings and screenshots.
  devIndicators: false,
  // A second dev server (e.g. the v2 preview on :3101) needs its own build dir next to the main one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@mercado/shared"],
  // mppx has an optional @modelcontextprotocol/sdk import that Turbopack cannot bundle.
  serverExternalPackages: ["mppx"],
  // Let josu open the dev server over Tailscale (private tailnet only; port 3100 is not public).
  allowedDevOrigins: ["*.trycloudflare.com", "*.ts.net"],
  // npm-workspaces monorepo: trace server files from the repo root, and ship the files server code reads at
  // runtime (repoRoot() finds the root package.json; driver fixtures; the FX relay record, when present).
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  outputFileTracingIncludes: {
    "/**": ["../../package.json", "../../fixtures/**/*.json", "../../packages/contracts/cache/fx-relay.json"],
  },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
