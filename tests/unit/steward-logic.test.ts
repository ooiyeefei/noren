import { describe, expect, it } from "vitest";
import {
  addExcerpt,
  disputeArgs,
  missingTranslations,
  placeRows,
  roleOptions,
  visibilityArgs,
  visibilityChoices,
} from "@/components/steward/steward-logic";
import { regionSchema } from "@/lib/region/schema";
import nagasaki from "../../regions/nagasaki.json";
const region = regionSchema.parse(nagasaki);
const mock = { kind: "business", isMock: true, visibility: "draft" } as const;
const boxes = { agreementRecorded: false, confirmFictional: false };
describe("steward logic", () => {
  it("a real place with a landmark label cannot go demo_public", () => {
    expect(
      visibilityChoices({ ...mock, isMock: false, kind: "landmark" }, region).find(
        (c) => c.visibility === "demo_public",
      ),
    ).toEqual({ visibility: "demo_public", allowed: false, needs: "landmark_kind" });
  });
  it.each(["business", "landmark"] as const)(
    "a mock %s needs the confirm-fictional box",
    (kind) => {
      const choice = visibilityChoices({ ...mock, kind }, region).find(
        (c) => c.visibility === "demo_public",
      )!;
      expect(choice).toEqual({
        visibility: "demo_public",
        allowed: true,
        needs: "confirm_fictional",
      });
      expect(
        visibilityArgs("place", "demo_public", { ...boxes, confirmFictional: true }, choice),
      ).toEqual({ placeId: "place", visibility: "demo_public", confirmFictional: true });
    },
  );
  it("a real business cannot leave draft while launchPackComplete is false", () => {
    expect(
      visibilityChoices({ ...mock, isMock: false }, region)
        .filter((c) => c.allowed)
        .map((c) => c.visibility),
    ).toEqual(["draft"]);
    expect(visibilityChoices(mock, region).find((c) => c.visibility === "pilot")?.needs).toBe(
      "launch_pack",
    );
  });
  it.each(["business", "landmark"] as const)(
    "a real %s publishes without agreement after the launch pack; the legacy pilot gate stays dormant",
    (kind) => {
      const choices = visibilityChoices(
        { ...mock, kind, isMock: false },
        { legal: { ...region.legal, launchPackComplete: true } },
      );
      expect(choices.find((c) => c.visibility === "pilot")).toEqual({
        visibility: "pilot",
        allowed: true,
        needs: "owner_agreement",
      });
      const publicChoice = choices.find((c) => c.visibility === "public")!;
      expect(publicChoice).toEqual({ visibility: "public", allowed: true, needs: "nothing" });
      expect(visibilityArgs("p", "public", boxes, publicChoice)).toEqual({
        placeId: "p",
        visibility: "public",
      });
      expect(choices.find((c) => c.visibility === "demo_public")).toEqual({
        visibility: "demo_public",
        allowed: false,
        needs: "landmark_kind",
      });
    },
  );
  it("mock places cannot be public, even with a complete launch pack", () => {
    expect(
      visibilityChoices(mock, { legal: { ...region.legal, launchPackComplete: true } }).find(
        (c) => c.visibility === "public",
      ),
    ).toEqual({ visibility: "public", allowed: false, needs: "real_only" });
  });
  it("visibilityArgs returns null when a needed box is unticked", () => {
    for (const needs of ["confirm_fictional", "owner_agreement"] as const)
      expect(
        visibilityArgs("p", "pilot", boxes, { visibility: "pilot", allowed: true, needs }),
      ).toBeNull();
    expect(
      visibilityArgs(
        "p",
        "pilot",
        { ...boxes, agreementRecorded: true },
        { visibility: "pilot", allowed: true, needs: "owner_agreement" },
      ),
    ).toEqual({ placeId: "p", visibility: "pilot", agreementRecorded: true });
    expect(
      visibilityArgs("p", "pilot", boxes, { visibility: "draft", allowed: true, needs: "nothing" }),
    ).toBeNull();
  });
  it("disputeArgs needs two different published claims", () => {
    const a = { _id: "a", status: "published" } as const;
    expect(disputeArgs([a])).toEqual({ error: "pick_two" });
    expect(disputeArgs([a, a])).toEqual({ error: "pick_two" });
    expect(disputeArgs([a, { _id: "b", status: "disputed" }])).toEqual({ error: "not_published" });
    expect(disputeArgs([a, { ...a, _id: "b" }])).toEqual({ claimIdA: "a", claimIdB: "b" });
  });
  it("open text never needs a translation", () => {
    const claim = {
      origin: "open_text",
      status: "published",
      langOriginal: "ja",
      translations: [],
    } as const;
    expect(missingTranslations(claim, ["ja", "en"])).toEqual([]);
    expect(missingTranslations({ ...claim, origin: "interview" }, ["ja", "en"])).toEqual(["en"]);
    expect(
      missingTranslations({ ...claim, origin: "interview", translations: [{ lang: "en" }] }, [
        "ja",
        "en",
      ]),
    ).toEqual([]);
    expect(
      missingTranslations({ ...claim, origin: "interview", status: "proposed" }, ["en"]),
    ).toEqual([]);
  });
  it("addExcerpt refuses blank, out-of-range and overlapping selections, including across a surrogate pair", () => {
    const text = "A😀 B";
    expect(addExcerpt(text, [], { start: 3, end: 4 }, "story")).toEqual({
      ok: false,
      reason: "blank",
    });
    for (const span of [
      { start: -1, end: 1 },
      { start: 0, end: 6 },
      { start: 1, end: 1 },
      { start: 0.5, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ])
      expect(addExcerpt(text, [], span, "fact")).toEqual({ ok: false, reason: "range" });
    const first = { start: 1, end: 3, kind: "story" } as const;
    expect(addExcerpt(text, [first], { start: 0, end: 3 }, "fact")).toEqual({
      ok: false,
      reason: "overlap",
    });
    expect(addExcerpt(text, [first], { start: 4, end: 5 }, "fact")).toEqual({
      ok: true,
      excerpts: [first, { start: 4, end: 5, kind: "fact" }],
    });
    expect(addExcerpt(text, [], { start: 1, end: 3 }, "story").ok).toBe(true);
  });
  it("a steward's own row has no role options", () => {
    expect(roleOptions({ role: "steward" })).toBeNull();
    expect(roleOptions({ role: "user" })).toEqual(["user", "creator", "business_owner"]);
  });
  it("placeRows puts drafts first", () => {
    const base = {
      _id: "public",
      slug: "demo",
      names: [{ lang: "en", script: "latin", value: "Mock name", isPrimary: true }],
      kind: "landmark",
      visibility: "demo_public",
      isMock: true,
      ownerCount: 2,
    } as const;
    const places = [base, { ...base, _id: "draft", visibility: "draft" as const }];
    expect(placeRows(places, "en", region)).toEqual([
      {
        id: "draft",
        slug: "demo",
        name: "Mock name",
        kind: "landmark",
        visibility: "draft",
        isMock: true,
        ownerCount: 2,
      },
      {
        id: "public",
        slug: "demo",
        name: "Mock name",
        kind: "landmark",
        visibility: "demo_public",
        isMock: true,
        ownerCount: 2,
      },
    ]);
    expect(places[0]!._id).toBe("public");
  });
});
