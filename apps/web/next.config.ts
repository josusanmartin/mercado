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
  allowedDevOrigins: ["tailnet-host.ts.net", "tailnet-ip", "*.trycloudflare.com", "*.ts.net"],
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
