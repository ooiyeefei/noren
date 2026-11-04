/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  addOwner,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// All names and identifiers are synthetic.
const modules = import.meta.glob("./**/*.ts");
const signals = [
  { kind: "brand_list" as const, reason: "Name Suggestion Index 0.0.0: synthetic brand" },
];
const basis = "Name Suggestion Index 0.0.0; Overture 0000-00-00.0";

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "synthetic-steward", "steward");
  /** A place on the map from open data, as the OSM and Overture imports leave it. */
  const listing = async (provider: "osm" | "overture" = "overture") => {
    const placeId = await addPlace(b, {
      createdBy: steward,
      visibility: "public",
      category: "restaurant",
    });
    await b.run((ctx) =>
      ctx.db.insert("placeExternalRef", {
        placeId,
        provider,
        ref: provider === "osm" ? "node/1" : "00000000-0000-4000-8000-000000000001",
        licence: provider === "osm" ? "ODbL-1.0" : "CDLA-Permissive-2.0",
        retrievedAt: 1,
      }),
    );
    return placeId;
  };
  const hide = (
    places: { placeId: Id<"place">; signals?: typeof signals }[],
    stewardPersonId: Id<"person"> = steward,
  ) =>
    b.t.mutation(internal.chains.hideChains, {
      regionId: "nagasaki",
      stewardPersonId,
      basis,
      places: places.map((item) => ({ placeId: item.placeId, signals: item.signals ?? signals })),
    });
  return { ...b, steward, listing, hide };
}

describe("chains.hideChains", () => {
  it("hides a public open-data listing through the not-for-visitors path and audits the reasons", async () => {
    const b = await setup();
    const placeId = await b.listing();
    expect(await b.hide([{ placeId }])).toEqual({ hidden: 1, alreadyHidden: 0, skipped: [] });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "draft",
      hiddenReason: "not_for_visitors",
    });
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits).toMatchObject([
      {
        action: "chain_listing.hide",
        actorKind: "person",
        actorPersonId: b.steward,
        targetType: "place",
        targetId: placeId,
        diff: {
          visibility: { from: "public", to: "draft" },
          hiddenReason: "not_for_visitors",
          chain: { basis, signals },
        },
      },
    ]);
    expect(await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
  });

  it("also hides an OSM listing, and can be put back by a steward", async () => {
    const b = await setup();
    const placeId = await b.listing("osm");
    await b.hide([{ placeId }]);
    await b
      .as("synthetic-steward")
      .mutation(api.places.setVisibility, { placeId, visibility: "public" });
    const restored = await b.run((ctx) => ctx.db.get("place", placeId));
    expect(restored).toMatchObject({ visibility: "public" });
    expect(restored?.hiddenReason).toBeUndefined();
  });

  it("can be run again: a hidden place is counted, not hidden twice, and not audited twice", async () => {
    const b = await setup();
    const placeId = await b.listing();
    await b.hide([{ placeId }]);
    expect(await b.hide([{ placeId }])).toEqual({ hidden: 0, alreadyHidden: 1, skipped: [] });
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits).toHaveLength(1);
  });

  it("refuses a mock steward, a person who is not a steward, and an unknown person", async () => {
    const b = await setup();
    const placeId = await b.listing();
    const mockSteward = await addPerson(b, "synthetic-mock-steward", "steward", { isMock: true });
    const creator = await addPerson(b, "synthetic-creator", "creator");
    expect(await errorCode(b.hide([{ placeId }], mockSteward))).toBe("invalid_input");
    expect(await errorCode(b.hide([{ placeId }], creator))).toBe("invalid_input");
    const gone = await b.run(async (ctx) => {
      const id = await ctx.db.insert("person", {
        tokenIdentifier: "synthetic|gone",
        clerkUserId: "gone",
        role: "steward",
        displayName: "Gone",
        isMock: false,
      });
      await ctx.db.delete("person", id);
      return id;
    });
    expect(await errorCode(b.hide([{ placeId }], gone))).toBe("invalid_input");
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "public",
    });
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(1))).toEqual([]);
  });

  it("never hides a place that has a story, a linked post or a confirmed owner", async () => {
    const b = await setup();
    const author = await addPerson(b, "synthetic-author", "user");
    const withStory = await b.listing();
    await b.run((ctx) =>
      ctx.db.insert("story", {
        placeId: withStory,
        authorPersonId: author,
        body: "synthetic story",
        lang: "ja",
        status: "live",
        isMock: false,
      }),
    );
    const withPost = await b.listing();
    await addSource(b, { placeId: withPost, addedBy: author, isMock: false });
    const withOwner = await b.listing();
    const owner = await addPerson(b, "synthetic-owner", "business_owner");
    await addOwner(b, withOwner, owner, b.steward);
    const plain = await b.listing();

    const result = await b.hide([
      { placeId: withStory },
      { placeId: withPost },
      { placeId: withOwner },
      { placeId: plain },
    ]);
    expect(result).toMatchObject({ hidden: 1, alreadyHidden: 0 });
    expect(result.skipped).toEqual([
      { placeId: withStory, reason: "has a story" },
      { placeId: withPost, reason: "has a linked post" },
      { placeId: withOwner, reason: "has a confirmed owner" },
    ]);
    for (const placeId of [withStory, withPost, withOwner])
      expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
        visibility: "public",
      });
    expect(await b.run((ctx) => ctx.db.get("place", plain))).toMatchObject({ visibility: "draft" });
  });

  it("never hides a hidden story either, a place a member added, or one with a page", async () => {
    const b = await setup();
    const author = await addPerson(b, "synthetic-author", "user");
    const withHiddenStory = await b.listing();
    await b.run((ctx) =>
      ctx.db.insert("story", {
        placeId: withHiddenStory,
        authorPersonId: author,
        body: "synthetic story",
        lang: "ja",
        status: "hidden",
        isMock: false,
      }),
    );
    const shared = await b.listing();
    await b.run((ctx) => ctx.db.patch("place", shared, { sharedAt: 1 }));
    const result = await b.hide([{ placeId: withHiddenStory }, { placeId: shared }]);
    expect(result.hidden).toBe(0);
    expect(result.skipped.map((item) => item.reason)).toEqual(["has a story", "added by a member"]);
  });

  it("skips a place that is not an open-data listing, a mock place, a draft and a missing reason", async () => {
    const b = await setup();
    const byHand = await addPlace(b, {
      createdBy: b.steward,
      visibility: "public",
      category: "restaurant",
    });
    const draft = await addPlace(b, {
      createdBy: b.steward,
      visibility: "draft",
      category: "restaurant",
    });
    const mockSteward = await addPerson(b, "synthetic-mock-owner", "creator", { isMock: true });
    const mock = await addPlace(b, {
      createdBy: mockSteward,
      visibility: "demo_public",
      category: "restaurant",
    });
    const plain = await b.listing();
    const otherRegion = await b.run(async (ctx) => {
      const id = await ctx.db.insert("place", {
        regionId: "elsewhere",
        slug: "synthetic-elsewhere",
        visibility: "public",
        createdBy: b.steward,
        isMock: false,
        category: "restaurant",
      });
      return id;
    });
    const result = await b.hide([
      { placeId: byHand },
      { placeId: draft },
      { placeId: mock },
      { placeId: plain, signals: [] },
      { placeId: otherRegion },
    ]);
    expect(result.hidden).toBe(0);
    expect(result.skipped).toEqual([
      { placeId: byHand, reason: "not an open-data listing" },
      { placeId: draft, reason: "not a real public place" },
      { placeId: mock, reason: "not a real public place" },
      { placeId: plain, reason: "no reason given" },
      { placeId: otherRegion, reason: "place not found in this region" },
    ]);
  });

  it("refuses more than a hundred places at once", async () => {
    const b = await setup();
    const placeId = await b.listing();
    expect(await errorCode(b.hide(Array.from({ length: 101 }, () => ({ placeId }))))).toBe(
      "invalid_input",
    );
  });
});
