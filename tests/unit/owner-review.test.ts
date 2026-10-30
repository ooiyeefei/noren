import { describe, expect, it } from "vitest";
import {
  groupClaims,
  isInvalidIdError,
  languageName,
  ownerMayAct,
  ownerMayRemove,
  placeLabel,
  reviewCounts,
  toCardData,
  translationRows,
  type ClaimViewLike,
} from "@/components/owner/review";
import type { ClaimStatus } from "@/lib/domain/constants";
import type { RegionConfig } from "@/lib/region/schema";

const vocabulary: RegionConfig["cautionVocabulary"] = [
  { key: "cash_only", labels: { ja: "現金のみ", en: "Cash only" }, labelsReviewedBy: null },
  { key: "mock_only_default", labels: { ja: "既定の言語のみ" }, labelsReviewedBy: "Mock Reviewer" },
];

describe("ownerMayRemove", () => {
  it.each([
    ["published", "published"],
    ["confirmed", "owner_confirmed"],
    ["disputed", "disputed"],
    ["proposed", "proposed"],
  ] as const)("an owner may remove a %s claim", (_label, status) => {
    expect(ownerMayRemove({ origin: "interview", status })).toBe(true);
  });

  it("an owner may not remove an open-text claim", () => {
    for (const status of [
      "proposed",
      "owner_confirmed",
      "published",
      "disputed",
      "hidden",
    ] as const) {
      expect(ownerMayRemove({ origin: "open_text", status })).toBe(false);
    }
  });

  it("an owner may not remove a hidden claim", () => {
    expect(ownerMayRemove({ origin: "interview", status: "hidden" })).toBe(false);
  });
});

function claim(id: string, overrides: Partial<ClaimViewLike> = {}): ClaimViewLike {
  return {
    _id: id,
    kind: "story",
    textOriginal: `架空の文 ${id}`,
    langOriginal: "ja",
    origin: "interview",
    quote: `架空の発言 ${id}`,
    spanStart: 0,
    sourceTranscriptId: "transcript-a",
    status: "proposed",
    aiAssisted: false,
    isMock: true,
    translations: [],
    ...overrides,
  };
}

describe("groupClaims", () => {
  it("proposed claims are to review, owner_confirmed are confirmed, published and disputed are published, hidden are dropped", () => {
    const statuses: ClaimStatus[] = [
      "proposed",
      "owner_confirmed",
      "published",
      "disputed",
      "hidden",
    ];
    const groups = groupClaims(statuses.map((status) => claim(status, { status })));
    expect(groups.toReview.map((c) => c._id)).toEqual(["proposed"]);
    expect(groups.confirmed.map((c) => c._id)).toEqual(["owner_confirmed"]);
    expect(groups.published.map((c) => c._id)).toEqual(["published", "disputed"]);
    const everyId = Object.values(groups).flatMap((group) => group.map((c) => c._id));
    expect(everyId).not.toContain("hidden");
  });

  it("orders what is to review by interview, oldest first, then by where it was said", () => {
    // The query returns claims oldest first, so the first claim from a transcript places it.
    const groups = groupClaims([
      claim("old-late", { sourceTranscriptId: "t1", spanStart: 40 }),
      claim("new-early", { sourceTranscriptId: "t2", spanStart: 2 }),
      claim("old-early", { sourceTranscriptId: "t1", spanStart: 3 }),
      claim("open", { origin: "open_text", sourceTranscriptId: undefined, spanStart: 0 }),
      claim("old-none", { sourceTranscriptId: "t1", spanStart: undefined }),
    ]);
    expect(groups.toReview.map((c) => c._id)).toEqual([
      "old-early",
      "old-late",
      "old-none",
      "new-early",
      "open",
    ]);
  });
});

describe("toCardData", () => {
  it("labels a caution in ja and falls back to the default locale", () => {
    const cash = claim("c1", { kind: "caution", cautionType: "cash_only" });
    expect(toCardData(cash, "ja", vocabulary, "ja")).toMatchObject({
      cautionLabel: "現金のみ",
      cautionReviewed: false,
    });
    expect(toCardData(cash, "en", vocabulary, "ja").cautionLabel).toBe("Cash only");
    // English has no label for this key, so the region's default language answers.
    const fallback = claim("c2", { kind: "caution", cautionType: "mock_only_default" });
    expect(toCardData(fallback, "en", vocabulary, "ja")).toMatchObject({
      cautionLabel: "既定の言語のみ",
      cautionReviewed: true,
    });
    // A key the vocabulary does not know is shown as it is, never hidden.
    const unknown = claim("c3", { kind: "caution", cautionType: "gone_key" });
    expect(toCardData(unknown, "ja", vocabulary, "ja")).toMatchObject({
      cautionLabel: "gone_key",
      cautionReviewed: false,
    });
  });

  it("gives a plain claim a string id, its own text and quote, and no caution label", () => {
    const data = toCardData(claim("s1", { aiAssisted: true }), "ja", vocabulary, "ja");
    expect(data.cautionLabel).toBeUndefined();
    expect(data.card).toEqual({
      id: "s1",
      kind: "story",
      cautionType: undefined,
      textOriginal: "架空の文 s1",
      langOriginal: "ja",
      quote: "架空の発言 s1",
      status: "proposed",
      aiAssisted: true,
      isMock: true,
    });
  });
});

describe("translationRows", () => {
  it("shows human over machine and pending for a missing locale, never the claim's own language", () => {
    const rows = translationRows(
      claim("t1", {
        translations: [
          { lang: "en", text: "machine words", origin: "machine" },
          { lang: "en", text: "checked words", origin: "human", reviewedBy: "Mock Reviewer" },
          { lang: "ja", text: "must never show", origin: "machine" },
        ],
      }),
      ["ja", "en", "zh"],
    );
    expect(rows).toEqual([
      { lang: "en", state: "human", text: "checked words", reviewedBy: "Mock Reviewer" },
      { lang: "zh", state: "pending" },
    ]);
    expect(translationRows(claim("t2"), ["ja", "en"])).toEqual([{ lang: "en", state: "pending" }]);
    expect(
      translationRows(
        claim("t3", { translations: [{ lang: "en", text: "only machine", origin: "machine" }] }),
        ["ja", "en"],
      ),
    ).toEqual([{ lang: "en", state: "machine", text: "only machine", reviewedBy: undefined }]);
  });
});

describe("reviewCounts", () => {
  it("counts untranslated confirmed claims only", () => {
    const translated = [{ lang: "en", text: "done", origin: "machine" as const }];
    const counts = reviewCounts(
      [
        claim("proposed", { status: "proposed" }),
        claim("proposed-open", { status: "proposed", origin: "open_text" }),
        claim("confirmed-none", { status: "owner_confirmed" }),
        claim("confirmed-done", { status: "owner_confirmed", translations: translated }),
        claim("published-none", { status: "published" }),
        claim("disputed-none", { status: "disputed" }),
        claim("open-published", { status: "published", origin: "open_text" }),
        claim("hidden", { status: "hidden" }),
        claim("english", { status: "owner_confirmed", langOriginal: "en", translations: [] }),
      ],
      ["ja", "en"],
    );
    // Four confirmed interview claims lack a translation ("english" lacks the Japanese one);
    // open text, translated, proposed and hidden claims are not counted.
    expect(counts).toEqual({ toReview: 1, untranslated: 4 });
    expect(reviewCounts([], ["ja", "en"])).toEqual({ toReview: 0, untranslated: 0 });
  });
});

describe("ownerMayAct", () => {
  it("an open-text claim is never actionable", () => {
    for (const status of [
      "proposed",
      "owner_confirmed",
      "published",
      "disputed",
      "hidden",
    ] as const) {
      expect(ownerMayAct({ origin: "open_text", status })).toBe(false);
    }
    expect(ownerMayAct({ origin: "interview", status: "proposed" })).toBe(true);
    expect(ownerMayAct({ origin: "interview", status: "published" })).toBe(false);
    expect(ownerMayAct({ origin: "interview", status: "hidden" })).toBe(false);
  });
});

describe("small helpers", () => {
  it("names a place in the viewer's script order and falls back to the unnamed text", () => {
    const region = {
      defaultLocale: "ja",
      nameFallback: { ja: ["kanji", "latin"], en: ["latin", "kanji"] },
    } as Pick<RegionConfig, "nameFallback" | "defaultLocale">;
    const names = [
      { lang: "en", script: "latin", value: "Mock Cafe", isPrimary: true },
      { lang: "ja", script: "kanji", value: "架空の喫茶店", isPrimary: true },
    ] as const;
    expect(placeLabel(names, "ja", region, "?")).toEqual({ text: "架空の喫茶店", lang: "ja" });
    expect(placeLabel(names, "en", region, "?")).toEqual({ text: "Mock Cafe", lang: "en" });
    expect(placeLabel([], "en", region, "Unnamed")).toEqual({ text: "Unnamed", lang: "en" });
  });

  it("names a language in the viewer's language and keeps an unknown code", () => {
    expect(languageName("en", "ja")).toBe("英語");
    expect(languageName("ja", "en")).toBe("Japanese");
    expect(languageName("not a code", "en")).toBe("not a code");
  });

  it("recognises Convex's rejection of a badly shaped id and nothing else", () => {
    expect(
      isInvalidIdError(new Error("ArgumentValidationError: Value does not match validator.")),
    ).toBe(true);
    expect(isInvalidIdError({ message: "Invalid argument `placeId` for query `places:get`" })).toBe(
      true,
    );
    expect(isInvalidIdError(new Error("Server Error"))).toBe(false);
    expect(isInvalidIdError("ArgumentValidationError")).toBe(false);
    expect(isInvalidIdError(null)).toBe(false);
  });
});
