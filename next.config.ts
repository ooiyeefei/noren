import type { NextConfig } from "next";
import { activeRegionConfig } from "./src/lib/region/registry";
import { cspHeaderFromEnv } from "./src/lib/security/csp";
import { noindexHeaderSources } from "./src/lib/seo/site";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A global 404 for a root layout under a dynamic segment ([lang]); see src/app/global-not-found.tsx.
  experimental: { globalNotFound: true },
  // Region files are read from disk at start-up, so they must ship with every server bundle.
  outputFileTracingIncludes: {
    "/*": ["./regions/**/*"],
    // The picture of a story draws its words in a Japanese font read from disk.
    "/api/share/[storyId]": ["./src/lib/share/fonts/*.ttf"],
    "/api/instagram-card/[postId]": ["./src/lib/share/fonts/*.ttf"],
    // The link preview of a postcard draws names in the same face.
    "/api/postcard/[code]/image": ["./src/lib/share/fonts/*.ttf"],
  },
  // FR-021: until the launch pack is complete every response, static files and error pages
  // included, is hidden from search engines. After that only the signed-in sections, /out and /api
  // are. This is set here rather than in the proxy because the proxy does not run for static files.
  async headers() {
    const region = activeRegionConfig();
    const noindex = noindexHeaderSources(region);
    return [
      ...noindex
        .filter((source) => source !== "/:path*")
        .map((source) => ({
          source,
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        })),
      {
        source: "/:path*",
        headers: [
          ...(noindex.includes("/:path*")
            ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
            : []),
          // T121: report-only until a clean walkthrough on the deployed site, then `enforce: true`.
          // It throws on a missing or malformed Clerk key or Convex URL, so a broken policy never ships quietly.
          cspHeaderFromEnv(process.env, { enforce: false, region }),
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
