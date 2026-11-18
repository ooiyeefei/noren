import { describe, expect, it } from "vitest";
import robots from "../../src/app/robots";
import { activeRegionConfig } from "../../src/lib/region/registry";
import {
  languageAlternates,
  noindexHeaderSources,
  robotsFile,
  sitemapXml,
} from "../../src/lib/seo/site";

const open = activeRegionConfig();
const closed = { ...open, legal: { ...open.legal, searchOpen: false, launchPackComplete: false } };

describe("robots.txt", () => {
  it("disallows every crawler from every path while search is closed (FR-021)", () => {
    expect(robotsFile(closed)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("opens the public pages and keeps the signed-in sections out once search is open", () => {
    const file = robots();
    const rules = file.rules as { allow: string; disallow: string[] };
    expect(rules.allow).toBe("/");
    for (const path of ["/api/", "/out/", "/en/steward", "/ja/account"]) {
      expect(rules.disallow).toContain(path);
    }
    expect(rules.disallow.some((path) => path.includes("/places"))).toBe(false);
    expect(file.sitemap).toBe("https://noren.yooi.me/sitemap.xml");
  });
});

describe("the noindex header", () => {
  it("covers every path while search is closed", () => {
    expect(noindexHeaderSources(closed)).toEqual(["/:path*"]);
  });

  it("covers only the signed-in sections, /out and /api once search is open", () => {
    const sources = noindexHeaderSources(open);
    expect(sources).not.toContain("/:path*");
    expect(sources).toContain("/:lang/steward/:path*");
    expect(sources).toContain("/api/:path*");
    expect(sources.some((source) => source.includes("places"))).toBe(false);
  });
});

describe("the sitemap", () => {
  it("lists a page once per language with every language beside it, escaped", () => {
    const xml = sitemapXml(open, ["places/a&b"]);
    expect(xml).toContain("<loc>https://noren.yooi.me/ja/places/a&amp;b</loc>");
    expect(xml).toContain("<loc>https://noren.yooi.me/en/places/a&amp;b</loc>");
    expect(xml).toContain('hreflang="x-default" href="https://noren.yooi.me/ja/places/a&amp;b"');
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it("gives a page its own address as canonical", () => {
    expect(languageAlternates(open, "en", "about").canonical).toBe(
      "https://noren.yooi.me/en/about",
    );
  });
});
