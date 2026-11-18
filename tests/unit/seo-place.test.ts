import { describe, expect, it } from "vitest";
import type { PlaceResult } from "../../src/lib/connector/place";
import { activeRegionConfig } from "../../src/lib/region/registry";
import type { StoriedPlace } from "../../src/lib/seo/listing";
import { llmsText } from "../../src/lib/seo/llms";
import { jsonLdText, placeSeo } from "../../src/lib/seo/place";

function result(over: {
  hasStory?: boolean;
  demo?: "Demo";
  stitched?: boolean;
  stories?: { writer: string; language: string; text: string }[];
  total?: number;
}): PlaceResult {
  return {
    place: {
      slug: "bravo-world",
      name: "Bravo World (ブラボーワールド)",
      names: [
        { value: "Bravo World", lang: "en", script: "latin" },
        { value: "ブラボーワールド", lang: "ja", script: "kana" },
      ],
      category: { key: "cafe", en: "Cafe", ja: "カフェ" },
      neighbourhood: { id: "castle-town", en: "Shimabara Castle Town", ja: "島原城下町" },
      hasStory: over.hasStory ?? true,
      confirmation: { confirmed: false, label: "Not yet confirmed" },
      ...(over.demo ? { demo: over.demo } : {}),
      url: "https://noren.yooi.me/en/places/bravo-world",
      writeAStoryUrl: "https://noren.yooi.me/en/places/bravo-world?tab=stories&write=1",
    },
    cautions: [],
    ownerStatements: [],
    memberStories: { total: over.total ?? over.stories?.length ?? 0, stories: over.stories ?? [] },
    stitchedStory: over.stitched
      ? {
          label: {
            en: "Stitched by Noren's AI from 2 posts",
            ja: "NorenのAIが2件の投稿からまとめました",
          },
          sentences: [
            {
              en: "The owner named it after a World Cup cheer.",
              ja: "店名はW杯の歓声から。",
              sources: [1],
            },
          ],
          sources: [
            {
              number: 1,
              words: "bravo!",
              language: "en",
              platform: "instagram",
              author: "someone",
              link: "https://example.test/p/1",
            },
          ],
        }
      : null,
    foundPosts: [],
    credits: [],
  } as unknown as PlaceResult;
}

const pin = { lat: 32.79, lng: 130.37 };

describe("a place page's summary for search engines", () => {
  it("leads with the stitched story, keeps its AI label and cites the posts it came from", () => {
    const seo = placeSeo(result({ stitched: true }), "en", pin, "Nagasaki");
    expect(seo.title).toBe(
      "Bravo World (ブラボーワールド) — Shimabara Castle Town, Nagasaki | Noren",
    );
    expect(seo.description).toBe("The owner named it after a World Cup cheer.");
    expect(seo.stitched?.label).toContain("AI");
    expect(seo.indexable).toBe(true);
    const article = seo.jsonLd.subjectOf as { creditText: string; citation: string[] };
    expect(article.creditText).toContain("AI");
    expect(article.citation).toEqual(["https://example.test/p/1"]);
    expect(seo.jsonLd.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 32.79,
      longitude: 130.37,
    });
  });

  it("carries no rating of any kind", () => {
    const text = JSON.stringify(placeSeo(result({ stitched: true }), "en", pin, "Nagasaki").jsonLd);
    expect(text).not.toMatch(/rating|review/i);
  });

  it("uses the Japanese sentences on the Japanese page", () => {
    expect(placeSeo(result({ stitched: true }), "ja", pin, "長崎").description).toBe(
      "店名はW杯の歓声から。",
    );
  });

  it("counts the member stories it was not given instead of showing them", () => {
    const seo = placeSeo(
      result({
        stories: [{ writer: "Aya", language: "en", text: "We stayed till closing." }],
        total: 3,
      }),
      "en",
      pin,
      "Nagasaki",
    );
    expect(seo.memberStories).toHaveLength(1);
    expect(seo.moreMemberStories).toBe(2);
    expect(seo.description).toBe("We stayed till closing.");
  });

  it("keeps a listing with no story, and a demo place, out of search results", () => {
    expect(placeSeo(result({ hasStory: false }), "en", pin, "Nagasaki").indexable).toBe(false);
    expect(placeSeo(result({ demo: "Demo" }), "en", pin, "Nagasaki").indexable).toBe(false);
  });

  it("falls back to a plain description and clips a long one", () => {
    const plain = placeSeo(result({ hasStory: false }), "en", null, "Nagasaki");
    expect(plain.description).toContain("Bravo World");
    expect(plain.jsonLd.geo).toBeUndefined();
    const long = placeSeo(
      result({ stories: [{ writer: "Aya", language: "en", text: "word ".repeat(100) }] }),
      "en",
      pin,
      "Nagasaki",
    );
    expect(long.description.length).toBeLessThanOrEqual(160);
    expect(long.description.endsWith("…")).toBe(true);
  });

  it("escapes < in the structured data so no text can close the script tag", () => {
    expect(jsonLdText({ name: "</script><b>" })).not.toContain("</script>");
  });
});

describe("llms.txt", () => {
  const places: StoriedPlace[] = [{ slug: "bravo-world", name: "Bravo World (ブラボーワールド)" }];

  it("says what Noren is, how to quote it, and lists the places with stories", () => {
    const text = llmsText(activeRegionConfig(), places);
    expect(text).toContain("# Noren");
    expect(text).toContain("Stitched by Noren's AI");
    expect(text).toContain("OpenStreetMap");
    expect(text).toContain("Overture");
    expect(text).toContain(
      "[Bravo World (ブラボーワールド)](https://noren.yooi.me/en/places/bravo-world)",
    );
    expect(text).toContain("/api/mcp");
  });

  it("leaves the connector out while it is switched off", () => {
    const region = activeRegionConfig();
    const off = { ...region, features: { ...region.features, connector: false } };
    expect(llmsText(off, places)).not.toContain("/api/mcp");
  });
});
