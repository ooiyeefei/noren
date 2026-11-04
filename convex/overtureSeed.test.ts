/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import nagasaki from "../regions/nagasaki.json";
import { addPerson, addPlace, newBackend, type Backend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// All names, identifiers and coordinates are synthetic.
const modules = import.meta.glob("./**/*.ts");
const gers = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const point = { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng };
const north = (metres: number) => ({ lat: point.lat + metres / 111_195, lng: point.lng });
const RELEASE = "2026-10-21.0";
const provenance = { release: RELEASE, retrievedAt: 1_793_000_000_000 };

const mockNames = [{ lang: "ja", script: "kanji" as const, value: "架空カフェ", isPrimary: true }];
const item = (n: number, extra: Record<string, unknown> = {}) => ({
  gers: gers(n),
  ...point,
  category: "cafe",
  names: mockNames,
  dataset: "meta",
  licence: "CDLA-Permissive-2.0" as const,
  ...extra,
});

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "synthetic-steward", "steward");
  const publish = (places: ReturnType<typeof item>[], stewardPersonId = steward) =>
    b.t.mutation(internal.overtureSeed.publishPlaces, {
      regionId: "nagasaki",
      stewardPersonId,
      ...provenance,
      places,
    });
  const link = (
    links: { placeId: Id<"place">; gers: string; lat: number; lng: number }[],
    stewardPersonId = steward,
  ) =>
    b.t.mutation(internal.overtureSeed.linkDuplicates, {
      regionId: "nagasaki",
      stewardPersonId,
      ...provenance,
      links: links.map((entry) => ({
        dataset: "Foursquare",
        licence: "Apache-2.0" as const,
        ...entry,
      })),
    });
  /** A place already on the map from OSM, as the OSM listing import leaves it. */
  const osmPlace = async (extra: { visibility?: "public" | "draft" } = {}) => {
    const placeId = await addPlace(b, {
      createdBy: steward,
      visibility: extra.visibility ?? "public",
      category: "cafe",
    });
    await b.run((ctx) =>
      ctx.db.insert("placeExternalRef", {
        placeId,
        provider: "osm",
        ref: "node/1",
        licence: "ODbL-1.0",
        attribution: "© OpenStreetMap contributors",
        retrievedAt: 1,
      }),
    );
    return placeId;
  };
  return { ...b, steward, publish, link, osmPlace };
}
const refsOf = (b: Backend, placeId: Id<"place">) =>
  b.run((ctx) =>
    ctx.db
      .query("placeExternalRef")
      .withIndex("by_placeId_and_provider_and_ref", (q) => q.eq("placeId", placeId))
      .take(10),
  );

describe("overtureSeed.publishPlaces", () => {
  it("publishes a public, not yet confirmed place with names, pin, reference and an audit entry", async () => {
    const b = await setup();
    const result = await b.publish([item(1)]);
    expect(result.skipped).toEqual([]);
    const { placeId, slug } = result.published[0]!;
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "public",
      kind: "business",
      category: "cafe",
      isMock: false,
      createdBy: b.steward,
    });
    const place = await b.run((ctx) => ctx.db.get("place", placeId));
    expect(place?.confirmedAt).toBeUndefined();
    expect(place?.confirmedBy).toBeUndefined();
    const detail = await b.t.query(api.places.get, { placeId });
    expect(detail).toMatchObject({
      slug,
      pin: point,
      names: [expect.objectContaining({ lang: "ja", value: "架空カフェ", isPrimary: true })],
      dataSources: [
        {
          provider: "overture",
          ref: gers(1),
          licence: "CDLA-Permissive-2.0",
          attribution:
            "Overture Maps Foundation (release 2026-10-21.0); data from Meta, CDLA-Permissive-2.0; https://docs.overturemaps.org/attribution/",
        },
      ],
    });
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("placeExternalRef")
          .withIndex("by_provider_and_ref", (q) => q.eq("provider", "overture").eq("ref", gers(1)))
          .unique(),
      ),
    ).toMatchObject({ retrievedAt: provenance.retrievedAt });
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      {
        action: "overture_listing.publish",
        actorKind: "person",
        actorPersonId: b.steward,
        targetId: placeId,
        diff: { overtureRef: gers(1), release: RELEASE, category: "cafe" },
      },
    ]);
  });

  it("shows on the map for a signed-out visitor, with the map copies and no confirmation", async () => {
    const b = await setup();
    await b.publish([item(1)]);
    const map = await b.t.query(api.places.listForMap, { regionId: "nagasaki" });
    expect(map).toHaveLength(1);
    expect(map[0]).toMatchObject({
      visibility: "public",
      category: "cafe",
      pin: point,
      names: [expect.objectContaining({ value: "架空カフェ" })],
      hasStory: false,
    });
    expect(map[0]?.confirmedAt).toBeUndefined();
  });

  it("keeps the licence of each record's own source, and the credit that names it", async () => {
    const b = await setup();
    const result = await b.publish([
      item(1),
      item(2, { ...north(500), dataset: "Foursquare", licence: "Apache-2.0" }),
      item(3, { ...north(1000), dataset: "AllThePlaces", licence: "CC0" }),
    ]);
    expect(result.published).toHaveLength(3);
    const all = await Promise.all(result.published.map(({ placeId }) => refsOf(b, placeId)));
    expect(
      all.map(([ref]) => [ref?.licence, ref?.attribution?.match(/data from ([^,]+),/)?.[1]]),
    ).toEqual([
      ["CDLA-Permissive-2.0", "Meta"],
      ["Apache-2.0", "Foursquare"],
      ["CC0", "AllThePlaces"],
    ]);
  });

  it("names a Latin-named place from its Latin name, and a Japanese-named one from its GERS id", async () => {
    const b = await setup();
    const result = await b.publish([
      item(1, {
        names: [
          { lang: "ja", script: "latin" as const, value: "Mock Cafe", isPrimary: true },
          { lang: "en", script: "latin" as const, value: "Mock Cafe", isPrimary: true },
        ],
      }),
      item(2, north(500)),
      item(3, {
        ...north(1000),
        names: [
          { lang: "ja", script: "latin" as const, value: "Mock Cafe", isPrimary: true },
          { lang: "en", script: "latin" as const, value: "Mock Cafe", isPrimary: true },
        ],
      }),
    ]);
    expect(result.published.map((row) => row.slug)).toEqual([
      "mock-cafe",
      "overture-000000000002",
      "mock-cafe-2",
    ]);
  });

  it("is idempotent: a reference already used is skipped, not made twice", async () => {
    const b = await setup();
    await b.publish([item(1)]);
    const again = await b.publish([item(1)]);
    expect(again.published).toEqual([]);
    expect(again.skipped).toEqual([{ gers: gers(1), reason: "Overture reference already used" }]);
    expect(await b.run((ctx) => ctx.db.query("place").take(10))).toHaveLength(1);
  });

  it("checks every item again and skips what it should not store", async () => {
    const b = await setup();
    const tooLong = "あ".repeat(121);
    const result = await b.publish([
      item(1, { lat: 40, lng: 140 }),
      item(2, { category: "other" }),
      item(3, { category: "nonsense" }),
      item(4, { gers: "../../etc/passwd" }),
      item(5, { dataset: "bad dataset <script>" }),
      item(6, { names: [] }),
      item(7, { names: [{ ...mockNames[0]!, value: tooLong }] }),
      item(8, { names: [{ ...mockNames[0]!, lang: "fr" }] }),
      item(9, {
        names: [mockNames[0]!, { ...mockNames[0]!, script: "kana" as const, value: "別" }],
      }),
      item(10, { names: [{ ...mockNames[0]!, isPrimary: false }] }),
      item(11, { ...north(900) }),
    ]);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      "outside region bbox",
      "not a focus category",
      "not a focus category",
      "not a GERS identifier",
      "unexpected dataset name",
      "needs one to twelve names",
      "invalid or duplicate name",
      "invalid or duplicate name",
      "invalid or duplicate name",
      "no primary name",
    ]);
    expect(result.published.map((row) => row.gers)).toEqual([gers(11)]);
  });

  it("refuses a licence outside the stored list at the validator", async () => {
    const b = await setup();
    await expect(b.publish([item(1, { licence: "MIT" })])).rejects.toThrow();
  });

  it("refuses a person who is not a steward, a mock steward and a batch over 50", async () => {
    const b = await setup();
    const user = await addPerson(b, "synthetic-user", "user");
    const mock = await addPerson(b, "mock-steward", "steward", { isMock: true });
    await expect(b.publish([item(1)], user)).rejects.toMatchObject({
      data: { code: "invalid_input", message: expect.stringContaining("steward") },
    });
    await expect(b.publish([item(1)], mock)).rejects.toMatchObject({
      data: { code: "invalid_input", message: expect.stringContaining("mock steward") },
    });
    await expect(
      b.publish(Array.from({ length: 51 }, (_, i) => item(i + 1, north(i * 300)))),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    expect(await b.run((ctx) => ctx.db.query("place").take(10))).toEqual([]);
  });

  it("refuses a release that is not an Overture release name", async () => {
    const b = await setup();
    await expect(
      b.t.mutation(internal.overtureSeed.publishPlaces, {
        regionId: "nagasaki",
        stewardPersonId: b.steward,
        release: "latest",
        retrievedAt: 1,
        places: [item(1)],
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
  });

  it("publishes 100 places in two batches with no slug exhaustion", async () => {
    const b = await setup();
    const places = Array.from({ length: 100 }, (_, i) => item(i + 1, north(i * 150)));
    const first = await b.publish(places.slice(0, 50));
    const second = await b.publish(places.slice(50));
    expect(first.published.length + second.published.length).toBe(100);
    expect(new Set([...first.published, ...second.published].map((row) => row.slug)).size).toBe(
      100,
    );
  });
});

describe("overtureSeed.linkDuplicates", () => {
  it("adds a reference to the place Noren already has, and changes nothing else about it", async () => {
    const b = await setup();
    const placeId = await b.osmPlace();
    const before = await b.run((ctx) => ctx.db.get("place", placeId));
    const result = await b.link([{ placeId, gers: gers(1), ...north(30) }]);
    expect(result).toEqual({ linked: 1, skipped: [] });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toEqual(before);
    expect(await b.run((ctx) => ctx.db.query("place").take(10))).toHaveLength(1);
    const detail = await b.t.query(api.places.get, { placeId });
    expect(detail?.dataSources.map((source) => [source.provider, source.licence])).toEqual(
      expect.arrayContaining([
        ["osm", "ODbL-1.0"],
        ["overture", "Apache-2.0"],
      ]),
    );
    expect(
      (await refsOf(b, placeId)).find((ref) => ref.provider === "overture")?.attribution,
    ).toContain("data from Foursquare, Apache-2.0");
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      { action: "overture_listing.link", targetId: placeId, diff: { overtureRef: gers(1) } },
    ]);
  });

  it("leaves a place a steward took off the map hidden", async () => {
    const b = await setup();
    const placeId = await b.osmPlace();
    await b.run((ctx) =>
      ctx.db.patch("place", placeId, { visibility: "draft", hiddenReason: "not_for_visitors" }),
    );
    await b.link([{ placeId, gers: gers(1), ...point }]);
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "draft",
      hiddenReason: "not_for_visitors",
    });
    expect(await b.t.query(api.places.listForMap, { regionId: "nagasaki" })).toEqual([]);
  });

  it("skips a place that is far from the record, missing, in another region, or a reference already used", async () => {
    const b = await setup();
    const placeId = await b.osmPlace();
    const elsewhere = await addPlace(b, {
      createdBy: b.steward,
      regionId: "other",
      visibility: "draft",
    });
    const missing = await b.run(async (ctx) => {
      const id = await ctx.db.insert("place", {
        regionId: "nagasaki",
        slug: "gone",
        visibility: "draft",
        createdBy: b.steward,
        isMock: false,
      });
      await ctx.db.delete("place", id);
      return id;
    });
    await b.link([{ placeId, gers: gers(9), ...point }]);
    const result = await b.link([
      { placeId, gers: gers(1), ...north(400) },
      { placeId: missing, gers: gers(2), ...point },
      { placeId: elsewhere, gers: gers(3), ...point },
      { placeId, gers: gers(9), ...point },
      { placeId, gers: "not-a-gers-id", ...point },
    ]);
    expect(result.linked).toBe(0);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      "place is not near the record",
      "place not found in this region",
      "place not found in this region",
      "Overture reference already used",
      "not a GERS identifier",
    ]);
  });

  it("refuses a non-steward, a mock steward and a batch over 100", async () => {
    const b = await setup();
    const placeId = await b.osmPlace();
    const user = await addPerson(b, "synthetic-user", "user");
    await expect(b.link([{ placeId, gers: gers(1), ...point }], user)).rejects.toMatchObject({
      data: { code: "invalid_input" },
    });
    const links = Array.from({ length: 101 }, (_, i) => ({ placeId, gers: gers(i + 1), ...point }));
    await expect(b.link(links)).rejects.toMatchObject({ data: { code: "invalid_input" } });
  });
});

describe("overtureSeed.existingPlaces", () => {
  it("lists places of the region with names, pin, references and whether they are on the map", async () => {
    const b = await setup();
    const onMap = await b.osmPlace();
    const hidden = await b.osmPlace({ visibility: "draft" });
    await b.run((ctx) => ctx.db.patch("place", hidden, { hiddenReason: "not_for_visitors" }));
    await addPlace(b, { createdBy: b.steward, regionId: "other" });
    const result = await b.t.query(internal.overtureSeed.existingPlaces, {
      regionId: "nagasaki",
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(result.isDone).toBe(true);
    expect(result.page).toHaveLength(2);
    const byId = new Map(result.page.map((row) => [row._id, row]));
    expect(byId.get(onMap)).toMatchObject({
      category: "cafe",
      onMap: true,
      names: expect.arrayContaining(["テスト店", "Test Shop"]),
      pin: point,
      refs: [{ provider: "osm", ref: "node/1" }],
    });
    expect(byId.get(hidden)?.onMap).toBe(false);
  });

  it("pages through the places", async () => {
    const b = await setup();
    for (let i = 0; i < 5; i++) await b.osmPlace();
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const page: { page: { _id: string }[]; isDone: boolean; continueCursor: string } =
        await b.t.query(internal.overtureSeed.existingPlaces, {
          regionId: "nagasaki",
          paginationOpts: { numItems: 2, cursor },
        });
      for (const row of page.page) seen.add(row._id);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    expect(seen.size).toBe(5);
  });
});

describe("overtureSeed.osmChainTags", () => {
  it("returns only the names of OSM candidates marked as part of a brand", async () => {
    const b = await setup();
    const candidate = (osmId: number, isChain: boolean, tags: Record<string, string>) =>
      b.run((ctx) =>
        ctx.db.insert("seedOsmCandidate", {
          regionId: "nagasaki",
          osmType: "node",
          osmId,
          tags,
          ...point,
          licence: "ODbL-1.0",
          isChain,
        }),
      );
    await candidate(1, true, {
      name: "架空バーガー",
      "name:en": "Mock Burger",
      amenity: "restaurant",
    });
    await candidate(2, false, { name: "架空食堂" });
    await candidate(3, true, { "name:ja": "架空コーヒー" });
    const result = await b.t.query(internal.overtureSeed.osmChainTags, {
      regionId: "nagasaki",
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(result.page).toEqual([
      { name: "架空バーガー", "name:en": "Mock Burger" },
      { "name:ja": "架空コーヒー" },
    ]);
  });
});

describe("an Overture listing is an open listing", () => {
  it("a steward may put an Overture place back on the map before launch, and not a place with no open-data reference", async () => {
    const b = await setup();
    const { published } = await b.publish([item(1)]);
    const placeId = published[0]!.placeId;
    await b.run((ctx) =>
      ctx.db.patch("place", placeId, { visibility: "draft", hiddenReason: "not_for_visitors" }),
    );
    await b.as("synthetic-steward").mutation(api.places.setVisibility, {
      placeId,
      visibility: "public",
    });
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "public",
    });
    const plain = await addPlace(b, { createdBy: b.steward, visibility: "draft" });
    await expect(
      b.as("synthetic-steward").mutation(api.places.setVisibility, {
        placeId: plain,
        visibility: "public",
      }),
    ).rejects.toMatchObject({ data: { message: expect.stringContaining("launch pack") } });
  });

  it("is not counted as a place the steward made by hand", async () => {
    const b = await setup();
    const { published } = await b.publish([item(1)]);
    // Even after someone confirms it, it stays out of the steward's own list.
    await b.run((ctx) =>
      ctx.db.patch("place", published[0]!.placeId, {
        confirmedAt: Date.now(),
        confirmedBy: b.steward,
      }),
    );
    expect(
      await b.as("synthetic-steward").query(api.places.listMine, { regionId: "nagasaki" }),
    ).toEqual([]);
  });
});
