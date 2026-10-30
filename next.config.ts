import type { NextConfig } from "next";
import { activeRegionConfig } from "./src/lib/region/registry";
import { cspHeaderFromEnv } from "./src/lib/security/csp";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A global 404 for a root layout under a dynamic segment ([lang]); see src/app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // Region files are read from disk at start-up, so they must ship with every server bundle.
  outputFileTracingIncludes: { "/*": ["./regions/**/*"] },
  // FR-021: every response, static files and error pages included, is hidden from search engines.
  // This is set here rather than in the proxy because the proxy does not run for static files.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // T121: report-only until a clean walkthrough on the deployed site, then `enforce: true`.
          // It throws on a missing or malformed Clerk key or Convex URL, so a broken policy never ships quietly.
          cspHeaderFromEnv(process.env, { enforce: false, region: activeRegionConfig() }),
        ],
      },
    ];
  },
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
