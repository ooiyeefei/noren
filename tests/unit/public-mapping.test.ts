import { describe, expect, it } from "vitest";
import { frameHostsFor, scriptHostsFor } from "@/lib/adapters";
import { DETERMINISTIC_COMPOSER } from "@/lib/claims/compose";
import { regionSchema } from "@/lib/region/schema";
import regionJson from "../../regions/nagasaki.json";
import {
  noticePlatforms,
  placeHeading,
  publicRegionProps,
  toEmbedSource,
  toHomeModel,
  toStoryViewModel,
  type PageViewLike,
  type PublicRegionProps,
  type PlaceSummaryLike,
  type SourceViewLike,
} from "@/components/public/mapping";

const config = regionSchema.parse(regionJson);
const region = publicRegionProps(config, "ja");
const names: PlaceSummaryLike["names"] = [
  { lang: "ja", script: "kanji", value: "デモ喫茶", isPrimary: true },
  { lang: "en", script: "latin", value: "Demo Cafe", isPrimary: true },
];
const place = (id: string, changes: Partial<PlaceSummaryLike> = {}): PlaceSummaryLike => ({
  _id: id,
  regionId: config.id,
  slug: id,
  kind: "business",
  visibility: "pilot",
  isMock: false,
  names,
  pin: { lat: 32.75, lng: 129.88 },
  ...changes,
});

describe("public mapping", () => {
  it("groups mock walkthrough separately from public real places, with locale hrefs and Demo flags", () => {
    for (const locale of ["ja", "en"] as const) {
      const input = [
        place("public", { visibility: "public", category: "cafe" }),
        place("landmark", { kind: "landmark" }),
        place("demo", { isMock: true, kind: "landmark", visibility: "demo_public" }),
      ];
      const result = toHomeModel(input, locale, region);
      expect(result.walkthrough.map((item) => item.id)).toEqual(["demo"]);
      expect(result.places.map((item) => item.id)).toEqual(["public", "landmark"]);
      expect(result.places[0]?.categoryLabel).toBe(locale === "ja" ? "カフェ・喫茶店" : "Café");
      expect(result.walkthrough[0]).toMatchObject({
        href: `/${locale}/places/demo`,
        isMock: true,
        name: locale === "ja" ? "デモ喫茶" : "Demo Cafe",
      });
      expect(result.places[0]?.isMock).toBe(false);
      expect(result.markers.map((marker) => marker.href)).toEqual(
        input.map((item) => `/${locale}/places/${item.slug}`),
      );
      expect(result.markers[2]?.isMock).toBe(true);
    }
  });
  it("keeps a place without a pin in the list without a marker", () => {
    const model = toHomeModel([place("no-pin", { pin: null })], "en", region);
    expect(model.places).toHaveLength(1);
    expect(model.markers).toEqual([]);
  });
  it("shows kanji first in ja and Latin first in en, omitting a secondary of the same script", () => {
    expect(placeHeading(names, "ja", region)).toEqual({
      primary: { text: "デモ喫茶", lang: "ja" },
      secondary: { text: "Demo Cafe", lang: "en" },
    });
    expect(placeHeading(names, "en", region)).toEqual({
      primary: { text: "Demo Cafe", lang: "en" },
      secondary: { text: "デモ喫茶", lang: "ja" },
    });
    expect(
      placeHeading([names[1]!, { ...names[1]!, value: "Cafe" }], "en", region).secondary,
    ).toBeNull();
    expect(placeHeading([], "en", region).primary).toEqual({ text: "Unnamed place", lang: "en" });
  });
  it("keeps sentence claim ids as strings, labels AI only for a non-deterministic composer, and localises unreviewed cautions", () => {
    const page: PageViewLike = {
      placeId: "place",
      version: 3,
      composedAt: 42,
      generatedBy: DETERMINISTIC_COMPOSER,
      sentences: [
        {
          lang: "en",
          ordinal: 0,
          text: "A demo story",
          textLang: "en",
          translation: "machine",
          claimIds: ["claim-a", "claim-b"],
        },
      ],
      claims: [
        {
          _id: "claim-a",
          kind: "story",
          textOriginal: "デモ",
          langOriginal: "ja",
          origin: "interview",
          status: "disputed",
          disputedWith: "claim-b",
          aiAssisted: true,
          isMock: true,
          translations: [],
        },
      ],
    };
    const cautionRegion: Pick<PublicRegionProps, "defaultLocale" | "cautionVocabulary"> = {
      defaultLocale: "ja",
      cautionVocabulary: [
        { key: "cash_only", labels: { ja: "現金のみ", en: "Cash only" }, labelsReviewedBy: null },
        { key: "steps", labels: { ja: "段差あり" }, labelsReviewedBy: "Demo reviewer" },
      ],
    };
    for (const locale of ["ja", "en"] as const) {
      const result = toStoryViewModel(page, {
        locale,
        placeName: "Demo Cafe",
        region: cautionRegion,
      });
      expect(result.sentences[0]?.claimIds).toEqual(["claim-a", "claim-b"]);
      expect(result.claims[0]).toMatchObject({
        id: "claim-a",
        disputedWith: "claim-b",
        aiAssisted: true,
      });
      expect(result.aiComposed).toBe(false);
      expect(result.cautionLabels.cash_only).toEqual({
        label: locale === "ja" ? "現金のみ" : "Cash only",
        reviewed: false,
      });
      expect(result.cautionLabels.steps).toEqual({ label: "段差あり", reviewed: true });
      expect(
        toStoryViewModel(
          { ...page, generatedBy: "model-v1" },
          { locale, placeName: "Demo Cafe", region: cautionRegion },
        ).aiComposed,
      ).toBe(true);
    }
  });
  it("passes credit and the note language through", () => {
    const source: SourceViewLike = {
      _id: "source",
      platform: "web",
      canonicalUrl: "https://example.com",
      embed: { kind: "link", url: "https://example.com" },
      title: "Demo title",
      authorHandle: "Demo creator",
      authorUrl: "https://example.com/creator",
      postedAt: 42,
      creatorNote: "架空のメモ",
      noteLang: "ja",
      isMock: true,
    };
    const { _id, ...rest } = source;
    expect(toEmbedSource(source)).toEqual({ id: _id, ...rest });
  });
  it("derives script and frame origins from enabled adapters only and swaps nothing else", () => {
    const onlyYoutube = { ...config, enabledSourceAdapters: ["youtube", "link_card"] as const };
    const changed = {
      ...onlyYoutube,
      enabledSourceAdapters: [...onlyYoutube.enabledSourceAdapters],
    };
    const props = publicRegionProps(changed, "en");
    expect(props).toEqual({
      categories: config.categories,
      regionId: config.id,
      defaultLocale: config.defaultLocale,
      nameFallback: config.nameFallback,
      center: config.defaultCenter,
      bounds: config.bbox,
      styleUrl: config.geo.mapStyle.url,
      attribution: config.geo.attribution,
      cautionVocabulary: config.cautionVocabulary,
      scriptOrigins: [],
      frameOrigins: ["https://www.youtube-nocookie.com"],
    });
    expect(region.scriptOrigins).toEqual(scriptHostsFor(config.enabledSourceAdapters));
    expect(region.frameOrigins).toEqual(frameHostsFor(config.enabledSourceAdapters));
    expect(publicRegionProps(config, "en")).toEqual(region);
    expect(noticePlatforms(changed, "en")).toEqual(["YouTube"]);
  });
});
