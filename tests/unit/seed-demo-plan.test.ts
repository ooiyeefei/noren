import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoSteps, parseDemoData, resolveArgs } from "../../scripts/lib/demo-plan";
import { getRegionConfig } from "../../src/lib/region/registry";
import { transcriptText } from "../../src/lib/claims/transcript-text";

export function fixture() {
  return {
    regionId: "nagasaki",
    issuerNote: "test issuer",
    accounts: {
      user: "mock-user",
      creator: "mock-creator",
      business_owner: "mock-owner",
      steward: "mock-steward",
    },
    place: {
      names: [{ lang: "en", script: "latin" as const, value: "Demo Cafe (mock)", isPrimary: true }],
      pin: { lat: 32.75, lng: 129.88 },
    },
    interview: {
      language: "ja",
      segments: [
        { start: 0, end: 1, speaker: "Mock owner", text: "😀これは架空の店です。" },
        { start: 1, end: 2, text: "これは模擬の物語です。" },
      ],
    },
    claims: [
      {
        kind: "fact" as const,
        quote: "これは架空の店です。",
        textOriginal: "これは架空の店です。",
        translations: { en: "This is a fictional shop." },
      },
      {
        kind: "story" as const,
        quote: "これは模擬の物語です。",
        textOriginal: "これは模擬の物語です。",
      },
    ],
    sources: [
      { url: "https://example.com/mock-one", title: "Mock link", authorAgreed: true },
      { url: "https://example.com/mock-two", title: "Mock link two", authorAgreed: false },
    ],
  };
}
const region = getRegionConfig("nagasaki")!;
describe("demo plan", () => {
  it("the example file has the same keys as a valid fixture", () => {
    const valid = parseDemoData(fixture());
    const example = JSON.parse(readFileSync("scripts/data/demo.example.json", "utf8"));
    expect(Object.keys(example).sort()).toEqual(Object.keys(valid).sort());
    expect(Object.keys(example.accounts).sort()).toEqual(Object.keys(valid.accounts).sort());
    expect(Object.keys(example.place).sort()).toEqual(Object.keys(valid.place).sort());
    expect(Object.keys(example.claims[0]).sort()).toEqual(Object.keys(valid.claims[0]!).sort());
  });
  it("a quote that is missing or occurs twice is refused with the claim's index", () => {
    for (const quote of ["absent", "これは"]) {
      const data = fixture();
      data.claims[0]!.quote = quote;
      expect(() => parseDemoData(data)).toThrow(/claim 0/);
    }
  });
  it("steps run in the documented order with the right identity for each", () => {
    const steps = demoSteps(parseDemoData(fixture()), region);
    expect(steps.map((s) => s.fn)).toEqual([
      ...Array(4).fill("seed:personIdFor"),
      ...Array(4).fill("people:current"),
      "places:listMine",
      "places:create",
      "places:attachOwner",
      "interviews:create",
      "interviews:recordConsent",
      "interviews:saveCorrection",
      "claims:proposeFromSpan",
      "claims:proposeFromSpan",
      "claims:review",
      "claims:review",
      "claims:setHumanTranslation",
      "sources:add",
      "sources:recordDemoConsent",
      "sources:add",
      "places:setVisibility",
      "pages:compose",
    ]);
    for (const s of steps.filter((s) =>
      ["places:create", "interviews:create", "claims:proposeFromSpan", "sources:add"].includes(
        s.fn,
      ),
    ))
      expect(s.as).toBe("creator");
    expect(steps.filter((s) => s.fn === "claims:review").map((s) => s.as)).toEqual([
      "business_owner",
      "business_owner",
    ]);
    expect(steps.find((s) => s.fn === "interviews:recordConsent")?.args).toMatchObject({
      textVersion: region.consent.textVersion,
      assisted: false,
      scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
    });
    for (const s of steps.filter((s) =>
      [
        "places:attachOwner",
        "claims:setHumanTranslation",
        "sources:recordDemoConsent",
        "places:setVisibility",
        "pages:compose",
      ].includes(s.fn),
    ))
      expect(s.as).toBe("steward");
  });
  it("spans equal the quote's offsets in transcriptText, including after an emoji", () => {
    const data = parseDemoData(fixture());
    const text = transcriptText(data.interview.segments);
    demoSteps(data, region)
      .filter((s) => s.fn === "claims:proposeFromSpan")
      .forEach((s, i) => {
        const args = s.args as { spanStart: number; spanEnd: number };
        expect(args.spanStart).toBe(text.indexOf(data.claims[i]!.quote));
        expect(text.slice(args.spanStart, args.spanEnd)).toBe(data.claims[i]!.quote);
        if (i === 0) expect(args.spanStart).toBe(2);
      });
  });
  it("only sources with authorAgreed get recordDemoConsent", () => {
    expect(
      demoSteps(parseDemoData(fixture()), region)
        .filter((s) => s.fn === "sources:recordDemoConsent")
        .map((s) => s.args),
    ).toEqual([{ sourceId: "$source0" }]);
  });
  it("the place becomes demo_public only through setVisibility with confirmFictional, after compose inputs are confirmed", () => {
    const steps = demoSteps(parseDemoData(fixture()), region);
    expect(steps.at(-2)).toMatchObject({
      fn: "places:setVisibility",
      as: "steward",
      args: { visibility: "demo_public", confirmFictional: true },
    });
    expect(steps.at(-1)?.fn).toBe("pages:compose");
    expect(steps.findIndex((s) => s.fn === "claims:review")).toBeLessThan(steps.length - 2);
    expect(steps.find((s) => s.fn === "places:create")?.args).not.toHaveProperty("visibility");
  });
  it("resolveArgs replaces placeholders and throws on a missing one", () => {
    expect(
      resolveArgs(
        { a: ["$placeId", { b: "$claim0" }], text: "a $literal phrase" },
        { placeId: "p", claim0: "c" },
      ),
    ).toEqual({ a: ["p", { b: "c" }], text: "a $literal phrase" });
    expect(() => resolveArgs("$missing", {})).toThrow(/missing/);
  });
});
