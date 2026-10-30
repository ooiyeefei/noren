import { describe, expect, it } from "vitest";
import {
  composeDeterministic,
  DETERMINISTIC_COMPOSER,
  type ComposeClaim,
} from "../../src/lib/claims/compose";

function claim(overrides: Partial<ComposeClaim> = {}): ComposeClaim {
  return {
    id: "mock-story",
    kind: "story",
    status: "published",
    textOriginal: " 架空の店の物語。 ",
    langOriginal: "ja",
    translations: { en: " A fictional shop's story. " },
    ...overrides,
  };
}

describe("deterministic composer", () => {
  it("one sentence per published story or fact claim per locale", () => {
    expect(DETERMINISTIC_COMPOSER).toBe("deterministic-v1");
    expect(
      composeDeterministic([claim(), claim({ id: "mock-fact", kind: "fact" })], ["ja", "en"]),
    ).toEqual([
      {
        lang: "ja",
        ordinal: 0,
        text: "架空の店の物語。",
        textLang: "ja",
        claimIds: ["mock-story"],
      },
      { lang: "ja", ordinal: 1, text: "架空の店の物語。", textLang: "ja", claimIds: ["mock-fact"] },
      {
        lang: "en",
        ordinal: 0,
        text: "A fictional shop's story.",
        textLang: "en",
        claimIds: ["mock-story"],
      },
      {
        lang: "en",
        ordinal: 1,
        text: "A fictional shop's story.",
        textLang: "en",
        claimIds: ["mock-fact"],
      },
    ]);
  });

  it.each(["proposed", "owner_confirmed", "hidden"] as const)("%s claims are skipped", (status) => {
    expect(composeDeterministic([claim({ status })], ["ja", "en"])).toEqual([]);
  });

  it("disputed claims are included", () => {
    expect(composeDeterministic([claim({ status: "disputed" })], ["ja"])).toHaveLength(1);
  });

  it("cautions and topics are skipped", () => {
    expect(
      composeDeterministic([claim({ kind: "caution" }), claim({ kind: "topic" })], ["ja"]),
    ).toEqual([]);
  });

  it("stories come before facts", () => {
    const claims = [
      claim({ id: "fact-1", kind: "fact" }),
      claim({ id: "story-1" }),
      claim({ id: "fact-2", kind: "fact" }),
      claim({ id: "story-2" }),
    ];
    expect(composeDeterministic(claims, ["ja"]).map((sentence) => sentence.claimIds)).toEqual([
      ["story-1"],
      ["story-2"],
      ["fact-1"],
      ["fact-2"],
    ]);
  });

  it("uses the translation for the other locale", () => {
    expect(
      composeDeterministic(
        [claim({ translations: { ja: "ignored", en: " Translated. " } })],
        ["en", "ja"],
      ),
    ).toEqual([
      { lang: "en", ordinal: 0, text: "Translated.", textLang: "en", claimIds: ["mock-story"] },
      {
        lang: "ja",
        ordinal: 0,
        text: "架空の店の物語。",
        textLang: "ja",
        claimIds: ["mock-story"],
      },
    ]);
  });

  it("falls back to the original with textLang set to the original language", () => {
    const claims = [
      claim({ translations: {} }),
      claim({ id: "blank-translation", translations: { en: " \n " } }),
    ];
    expect(
      composeDeterministic(claims, ["en"]).map(({ text, textLang }) => ({ text, textLang })),
    ).toEqual([
      { text: "架空の店の物語。", textLang: "ja" },
      { text: "架空の店の物語。", textLang: "ja" },
    ]);
  });

  it("ordinals are contiguous per locale", () => {
    const claims = [
      claim({ kind: "topic" }),
      claim(),
      claim({ textOriginal: "" }),
      claim({ kind: "fact" }),
    ];
    expect(
      composeDeterministic(claims, ["en", "ja"]).map(({ lang, ordinal }) => [lang, ordinal]),
    ).toEqual([
      ["en", 0],
      ["en", 1],
      ["ja", 0],
      ["ja", 1],
    ]);
  });

  it("blank texts are skipped", () => {
    expect(
      composeDeterministic(
        [claim({ textOriginal: " \n\t " }), claim({ textOriginal: "" })],
        ["ja", "en"],
      ),
    ).toEqual([]);
  });

  it("empty claims or locales produce no sentences", () => {
    expect(composeDeterministic([], ["ja"])).toEqual([]);
    expect(composeDeterministic([claim()], [])).toEqual([]);
  });
});
