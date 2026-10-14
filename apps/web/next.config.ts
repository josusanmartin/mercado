import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev "N" badge out of demo recordings and screenshots.
  devIndicators: false,
  transpilePackages: ["@mercado/shared"],
  // mppx has an optional @modelcontextprotocol/sdk import that Turbopack cannot bundle.
  serverExternalPackages: ["mppx"],
  // Let josu open the dev server over Tailscale (private tailnet only; port 3100 is not public).
  allowedDevOrigins: ["tailnet-host.ts.net", "tailnet-ip"],
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
