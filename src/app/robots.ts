import type { MetadataRoute } from "next";

// FR-021: the whole site is hidden from search engines.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
