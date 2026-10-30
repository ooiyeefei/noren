import { describe, expect, it } from "vitest";
import {
  buildNameSet,
  candidateDraft,
  candidateError,
  categoryOptions,
  detectScript,
  listArgs,
  nextPage,
  showChainBadge,
  validatePin,
  type Candidate,
} from "@/components/steward/candidates-logic";
import { getRegionConfig } from "@/lib/region/registry";
import { candidateMessages } from "@/lib/i18n/messages/candidates";

describe("candidate logic", () => {
  it("local-only on sends includeChains false and off sends true", () => {
    for (const localOnly of [true, false]) {
      expect(
        listArgs({
          regionId: "nagasaki",
          category: "",
          focusOnly: true,
          localOnly,
          paginationOpts: { numItems: 25, cursor: "next" },
        }),
      ).toEqual({
        regionId: "nagasaki",
        category: undefined,
        focusOnly: true,
        includeChains: !localOnly,
        paginationOpts: { numItems: 25, cursor: "next" },
      });
    }
    expect(
      listArgs({
        regionId: "nagasaki",
        category: "cafe",
        focusOnly: false,
        localOnly: false,
        paginationOpts: { numItems: 25, cursor: null },
      }).category,
    ).toBe("cafe");
  });

  it("rows without isChain are treated as not chains", () => {
    for (const localOnly of [true, false]) {
      expect(showChainBadge({}, localOnly)).toBe(false);
      expect(showChainBadge({ isChain: false }, localOnly)).toBe(false);
      expect(showChainBadge({ isChain: true }, localOnly)).toBe(!localOnly);
    }
  });

  it("script detection for kana, kanji, latin and mixed text", () => {
    for (const [text, script] of [
      ["カフェ", "kana"],
      ["ひらがな", "kana"],
      ["ｶﾌｪ", "kana"],
      ["架空の喫茶店", "kanji"],
      ["Mock Café", "latin"],
      ["Mock 喫茶カフェ", "kanji"],
      ["Mock カフェ", "kana"],
    ])
      expect(detectScript(text!)).toBe(script);
  });

  it("a name set needs one primary and refuses blanks", () => {
    const name = { lang: "ja" as const, value: "  架空の喫茶店  ", isPrimary: true };
    expect(
      buildNameSet([name, { lang: "en", value: " Mock Cafe ", isPrimary: true }], "en"),
    ).toEqual({
      ok: true,
      value: [
        { ...name, value: "架空の喫茶店", script: "kanji" },
        { lang: "en", value: "Mock Cafe", script: "latin", isPrimary: true },
      ],
    });
    for (const inputs of [
      [],
      [{ ...name, isPrimary: false }],
      [{ ...name, value: "   " }],
      [name, { ...name, value: "別の架空名" }],
      [name, { ...name, isPrimary: false }],
      [{ ...name, value: "x".repeat(121) }],
      Array.from({ length: 13 }, () => name),
    ]) {
      for (const locale of ["ja", "en"] as const) {
        const result = buildNameSet(inputs, locale);
        expect(result).toEqual({ ok: false, reason: candidateMessages[locale].invalidNames });
      }
    }
  });

  it("a pin outside the region is refused with a readable reason", () => {
    const region = getRegionConfig("nagasaki")!;
    const [west, south, east, north] = region.bbox;
    for (const locale of ["ja", "en"] as const) {
      for (const pin of [
        { lat: String(south - 0.01), lng: String(west) },
        { lat: String(north + 0.01), lng: String(east) },
        { lat: String(south), lng: String(west - 0.01) },
        { lat: String(north), lng: String(east + 0.01) },
        { lat: "", lng: String(west) },
        { lat: "NaN", lng: String(west) },
        { lat: String(south), lng: "Infinity" },
      ])
        expect(validatePin(region.id, pin, locale)).toEqual({
          ok: false,
          reason: candidateMessages[locale].invalidPin,
        });
      for (const [lat, lng] of [
        [south, west],
        [north, east],
      ])
        expect(validatePin(region.id, { lat: String(lat), lng: String(lng) }, locale)).toEqual({
          ok: true,
          value: { lat, lng },
        });
      expect(
        validatePin("unknown-region", { lat: String(south), lng: String(west) }, locale).ok,
      ).toBe(false);
    }
  });

  it("category options put focus categories first", () => {
    const region = getRegionConfig("nagasaki")!;
    const input = { categories: [...region.categories!].reverse() };
    for (const locale of ["ja", "en"] as const) {
      const options = categoryOptions(input, locale);
      expect(options.map((option) => option.focus)).toEqual([
        true,
        true,
        true,
        true,
        true,
        true,
        false,
        false,
      ]);
      expect(options.find((option) => option.key === "cafe")?.label).toBe(
        region.categories!.find((category) => category.key === "cafe")!.labels[locale],
      );
      expect(input.categories[0]!.key).toBe("other");
    }
    expect(categoryOptions({}, "en")).toEqual([]);
  });

  it("an empty page with a continue cursor asks for the next page, an empty done page ends the list", () => {
    expect(nextPage({ page: [], continueCursor: "next", isDone: false })).toBe("next");
    expect(nextPage({ page: [], continueCursor: "ignored", isDone: true })).toBeNull();
    expect(nextPage({ page: ["mock"], continueCursor: "next", isDone: false })).toBe("next");
  });

  it("server errors never become an empty message", () => {
    for (const locale of ["ja", "en"] as const) {
      for (const error of [
        null,
        undefined,
        "",
        "  ",
        {},
        new Error(""),
        { data: { code: "conflict", message: " " } },
      ])
        expect(candidateError(error, locale).trim().length).toBeGreaterThan(0);
      expect(
        candidateError({ data: { code: "conflict", message: "complete the launch pack" } }, locale),
      ).toContain("complete the launch pack");
    }
  });

  it("prefills language names and preserves a distinct primary tag without duplicate primaries", () => {
    const base: Candidate = {
      _id: "mock",
      osmType: "node",
      osmId: 1,
      category: "cafe",
      names: { ja: "架空の店", en: "Mock Shop", primary: "別の架空名" },
      lat: 32.75,
      lng: 129.87,
      attribution: "© OpenStreetMap contributors",
    };
    const draft = candidateDraft(base);
    expect(draft.names).toHaveLength(3);
    expect(draft.names[2]).toEqual({ lang: "ja", value: "別の架空名", isPrimary: false });
    expect(buildNameSet(draft.names, "en").ok).toBe(true);
    expect(candidateDraft({ ...base, names: { primary: "Mock Shop" } }).names).toEqual([
      { lang: "en", value: "Mock Shop", isPrimary: true },
    ]);
    expect(
      candidateDraft({ ...base, names: { ja: "架空の店", primary: "架空の店" } }).names,
    ).toHaveLength(1);
    expect(draft.lat).toBe("32.75");
  });
});
