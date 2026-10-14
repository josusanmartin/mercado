import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mercado/shared"],
  // mppx has an optional @modelcontextprotocol/sdk import that Turbopack cannot bundle.
  serverExternalPackages: ["mppx"],
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
