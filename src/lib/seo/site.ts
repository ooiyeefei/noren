import type { MetadataRoute } from "next";
import { NOREN_ORIGIN } from "../connector/urls";
import { deriveRegionPolicy, type RegionConfig } from "../region/schema";

// One place for what search engines and AI crawlers may read. Everything here follows the region's
// launch rule: while the launch pack is incomplete the whole site stays hidden, exactly as before.
// next.config.ts imports this file, so it uses relative imports only.

export const SITE_ORIGIN = NOREN_ORIGIN;

/**
 * Sections that belong to one signed-in person, or that are tools rather than reading. They stay
 * out of search results after launch. `/out` is the redirect to a source's own site.
 */
export const PRIVATE_SECTIONS = [
  "account",
  "creator",
  "owner",
  "steward",
  "stamps",
  "sign-in",
  "sign-up",
  "remembers",
  "plan",
  "walk",
  "takedown/status",
] as const;

/** Pages every visitor reads, listed in the sitemap in each language. */
export const PUBLIC_PAGES = [
  "welcome",
  "about",
  "map",
  "collection",
  "notice",
  "privacy",
  "terms",
] as const;

export function searchOpen(region: RegionConfig): boolean {
  return !deriveRegionPolicy(region).noindex;
}

/** The `source` patterns in next.config.ts that carry `X-Robots-Tag: noindex, nofollow`. */
export function noindexHeaderSources(region: RegionConfig): string[] {
  if (!searchOpen(region)) return ["/:path*"];
  return [
    ...PRIVATE_SECTIONS.map((section) => `/:lang/${section}/:path*`),
    "/out/:path*",
    "/api/:path*",
  ];
}

export function robotsFile(region: RegionConfig): MetadataRoute.Robots {
  if (!searchOpen(region)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/out/",
        ...region.locales.flatMap((locale) =>
          PRIVATE_SECTIONS.map((section) => `/${locale}/${section}`),
        ),
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

/** `path` is what follows the language, without a leading slash: "about", "places/bravo-world". */
export function pageUrl(locale: string, path: string): string {
  return `${SITE_ORIGIN}/${locale}/${path}`;
}

/** The canonical address of a page and the same page in each of the region's languages. */
export function languageAlternates(
  region: Pick<RegionConfig, "locales" | "defaultLocale">,
  locale: string,
  path: string,
): { canonical: string; languages: Record<string, string> } {
  return {
    canonical: pageUrl(locale, path),
    languages: {
      ...Object.fromEntries(region.locales.map((each) => [each, pageUrl(each, path)])),
      "x-default": pageUrl(region.defaultLocale, path),
    },
  };
}

const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A sitemap with each page once per language, and every language named beside it. */
export function sitemapXml(
  region: Pick<RegionConfig, "locales" | "defaultLocale">,
  paths: readonly string[],
): string {
  const urls = paths.flatMap((path) =>
    region.locales.map((locale) => {
      const { canonical, languages } = languageAlternates(region, locale, path);
      const links = Object.entries(languages)
        .map(
          ([lang, href]) =>
            `<xhtml:link rel="alternate" hreflang="${xml(lang)}" href="${xml(href)}"/>`,
        )
        .join("");
      return `<url><loc>${xml(canonical)}</loc>${links}</url>`;
    }),
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
}
