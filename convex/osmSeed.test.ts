/// <reference types="vite/client" />
import { anyApi, type ApiFromModules, type FunctionReturnType } from "convex/server";
import { describe, expect, it } from "vitest";
import { addPerson, addPlace, newBackend, type Backend } from "../tests/convex/fixtures";
import nagasaki from "../regions/nagasaki.json";
import type { Id } from "./_generated/dataModel";
import type * as osmSeed from "./osmSeed";
import type { ParsedCandidate } from "../src/lib/osm/overpass";

// Typed runtime proxy until the orchestrator regenerates api.d.ts; all fixtures are SYNTHETIC.
const f = (anyApi as unknown as ApiFromModules<{ osmSeed: typeof osmSeed }>).osmSeed;
const modules = import.meta.glob("./**/*.ts");
const point = { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng };
const candidate = (osmId = 1): ParsedCandidate => ({
  osmType: "node" as const,
  osmId,
  isChain: false,
  tags: { name: `Synthetic Cafe ${osmId}`, amenity: "cafe" },
  ...point,
  osmVersion: 2,
  osmTimestamp: "2026-10-30T00:00:00Z",
});
const names = [
  { lang: "ja", script: "kana" as const, value: "カクウカフェ", isPrimary: true },
  { lang: "en", script: "latin" as const, value: "Synthetic Cafe", isPrimary: true },
];
const importArgs = (candidates = [candidate()]) => ({
  regionId: "nagasaki",
  retrievedAt: 123,
  candidates,
});
async function rows(b: Backend) {
  return b.run((ctx) =>
    ctx.db
      .query("seedOsmCandidate")
      .withIndex("by_regionId", (q) => q.eq("regionId", "nagasaki"))
      .take(200),
  );
}
async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "mock-steward", "steward", { isMock: true });
  await addPerson(b, "mock-user", "user", { isMock: true });
  await b.t.mutation(f.importCandidates, importArgs());
  const id = (await rows(b))[0]!._id;
  return {
    ...b,
    steward,
    id,
    confirm: (candidateId = id) =>
      b
        .as("mock-steward")
        .mutation(f.confirmCandidate, { candidateId, names, pin: point, category: "cafe" }),
  };
}
const pageArgs = { regionId: "nagasaki", paginationOpts: { numItems: 2, cursor: null } };

async function listingSetup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "synthetic-steward", "steward");
  await b.t.mutation(
    f.importCandidates,
    importArgs([
      {
        ...candidate(),
        tags: { name: "架空カフェ", "name:en": "Synthetic Cafe", amenity: "cafe" },
      },
    ]),
  );
  const id = (await rows(b))[0]!._id;
  const args = { regionId: "nagasaki", stewardPersonId: steward, candidateIds: [id] };
  return { ...b, steward, id, args };
}

async function allPages(
  b: Backend,
  extra: { category?: string; focusOnly?: boolean; includeChains?: boolean } = {},
) {
  const items: Id<"seedOsmCandidate">[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const page: FunctionReturnType<typeof f.listCandidates> = await b
      .as("mock-steward")
      .query(f.listCandidates, { ...pageArgs, ...extra, paginationOpts: { numItems: 2, cursor } });
    items.push(...page.page.map((row) => row._id));
    if (page.isDone) return items;
    cursor = page.continueCursor;
  }
  throw new Error("synthetic pagination did not terminate");
}

describe("OSM seed via real gate", () => {
  it("the brand tag is never stored, only isChain", async () => {
    const b = newBackend(modules);
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        {
          ...candidate(),
          isChain: true,
          tags: { ...candidate().tags, brand: "Synthetic Brand", "brand:wikidata": "Q123" },
        },
      ]),
    );
    const [stored] = await rows(b);
    expect(stored?.isChain).toBe(true);
    expect(stored?.tags).toEqual(candidate().tags);
    expect(stored).not.toHaveProperty("brand");
    expect(stored).not.toHaveProperty("brand:wikidata");
  });
  it("re-import refreshes isChain on an unconfirmed candidate and leaves a confirmed one alone", async () => {
    const b = await setup();
    await b.t.mutation(f.importCandidates, importArgs([{ ...candidate(), isChain: true }]));
    expect((await rows(b))[0]?.isChain).toBe(true);
    // Optional input from an older caller clears a previously imported chain flag.
    const { isChain, ...legacyCandidate } = candidate();
    expect(isChain).toBe(false);
    await b.t.mutation(f.importCandidates, { ...importArgs(), candidates: [legacyCandidate] });
    expect((await rows(b))[0]?.isChain).toBe(false);
    await b.confirm();
    const before = (await rows(b))[0];
    expect(
      await b.t.mutation(f.importCandidates, importArgs([{ ...candidate(), isChain: true }])),
    ).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect((await rows(b))[0]).toEqual(before);
  });
  it("listCandidates hides chains by default and includes them with includeChains: true", async () => {
    const b = await setup();
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        { ...candidate(2), isChain: true },
        { ...candidate(3), tags: { name: "Synthetic Library", amenity: "library" } },
        {
          ...candidate(4),
          isChain: true,
          tags: { name: "Synthetic Chain Library", amenity: "library" },
        },
      ]),
    );
    // Exercise legacy stored rows where the flag is absent.
    await b.run((ctx) => ctx.db.patch("seedOsmCandidate", b.id, { isChain: undefined }));
    const stored = await rows(b);
    const local = stored.filter((row) => !row.isChain).map((row) => row._id);
    expect(await allPages(b)).toEqual(local);
    expect(await allPages(b, { includeChains: false })).toEqual(local);
    expect(await allPages(b, { includeChains: true })).toEqual(stored.map((row) => row._id));
    expect(await allPages(b, { focusOnly: true })).toEqual([b.id]);
    expect(await allPages(b, { focusOnly: true, includeChains: true })).toHaveLength(2);
    expect(await allPages(b, { category: "other" })).toHaveLength(1);
    expect(await allPages(b, { category: "other", includeChains: true })).toHaveLength(2);
    const page = await b.as("mock-steward").query(f.listCandidates, {
      ...pageArgs,
      includeChains: true,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page.map((row) => row.isChain)).toEqual([false, true, false, true]);
  });
  it("import is idempotent", async () => {
    const b = newBackend(modules);
    expect(await b.t.mutation(f.importCandidates, importArgs())).toEqual({
      inserted: 1,
      updated: 0,
      skipped: 0,
    });
    const before = (await rows(b))[0]!;
    expect(
      await b.t.mutation(f.importCandidates, {
        ...importArgs(),
        retrievedAt: 456,
        candidates: [
          {
            ...candidate(),
            tags: { name: "Synthetic Updated Cafe", cuisine: "izakaya", amenity: "restaurant" },
            osmVersion: 3,
          },
        ],
      }),
    ).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    const after = await rows(b);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      _id: before._id,
      retrievedAt: 456,
      osmVersion: 3,
      category: "bar",
      licence: "ODbL-1.0",
      tags: { name: "Synthetic Updated Cafe" },
    });
  });
  it("outside the bbox is skipped", async () => {
    const b = newBackend(modules);
    const [west, south, east, north] = nagasaki.bbox as [number, number, number, number];
    const points = [
      { lat: south - 0.001, lng: west },
      { lat: north + 0.001, lng: west },
      { lat: south, lng: west - 0.001 },
      { lat: south, lng: east + 0.001 },
      { lat: NaN, lng: west },
      { lat: south, lng: Infinity },
    ];
    expect(
      await b.t.mutation(
        f.importCandidates,
        importArgs(points.map((p, i) => ({ ...candidate(i + 1), ...p }))),
      ),
    ).toEqual({ inserted: 0, updated: 0, skipped: 6 });
    expect(await rows(b)).toEqual([]);
    expect(
      await b.t.mutation(
        f.importCandidates,
        importArgs([{ ...candidate(), lat: south, lng: west }]),
      ),
    ).toEqual({ inserted: 1, updated: 0, skipped: 0 });
  });
  it("extra tags are stripped", async () => {
    const b = newBackend(modules);
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        {
          ...candidate(),
          tags: {
            ...candidate().tags,
            "addr:street": "synthetic",
            phone: "synthetic",
            website: "https://example.invalid",
            operator: "synthetic",
            email: "synthetic",
          },
        },
      ]),
    );
    expect((await rows(b))[0]?.tags).toEqual(candidate().tags);
  });
  it("a confirmed candidate keeps its link on re-import", async () => {
    const b = await setup();
    const { placeId } = await b.confirm();
    const before = (await rows(b))[0];
    expect(await b.t.mutation(f.importCandidates, { ...importArgs(), retrievedAt: 999 })).toEqual({
      inserted: 0,
      updated: 0,
      skipped: 1,
    });
    expect((await rows(b))[0]).toEqual(before);
    expect((await rows(b))[0]?.confirmedPlaceId).toBe(placeId);
  });
  it("listCandidates is steward-only, paginated, hides confirmed, dismissed and already-referenced candidates", async () => {
    const b = await setup();
    await b.t.mutation(
      f.importCandidates,
      importArgs(Array.from({ length: 7 }, (_, i) => candidate(i + 2))),
    );
    const candidates = await rows(b);
    await b.confirm(candidates[0]!._id);
    await b.as("mock-steward").mutation(f.dismissCandidate, { candidateId: candidates[1]!._id });
    const placeId = await addPlace(b, { createdBy: b.steward });
    await b.run((ctx) =>
      ctx.db.insert("placeExternalRef", {
        placeId,
        provider: "osm",
        ref: `node/${candidates[2]!.osmId}`,
        licence: "ODbL-1.0",
        attribution: "© OpenStreetMap contributors",
        retrievedAt: 123,
      }),
    );
    await expect(b.t.query(f.listCandidates, pageArgs)).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    });
    await expect(b.as("mock-user").query(f.listCandidates, pageArgs)).rejects.toMatchObject({
      data: { code: "forbidden" },
    });
    const first = await b.as("mock-steward").query(f.listCandidates, pageArgs);
    expect(first.isDone).toBe(false);
    expect(first.page.length).toBeLessThanOrEqual(2);
    expect(new Set(await allPages(b))).toEqual(new Set(candidates.slice(3).map((c) => c._id)));
    await expect(b.confirm(candidates[2]!._id)).rejects.toMatchObject({
      data: { code: "conflict" },
    });
  });
  it.each([0, 60])(
    "hides and refuses an already-referenced candidate after %i unrelated references",
    async (unrelatedCount) => {
      const b = await setup();
      const placeId = await addPlace(b, { createdBy: b.steward });
      await b.run(async (ctx) => {
        const externalRef = {
          placeId,
          provider: "osm" as const,
          licence: "ODbL-1.0" as const,
          attribution: "© OpenStreetMap contributors",
          retrievedAt: 123,
        };
        for (let i = 0; i < unrelatedCount; i++)
          await ctx.db.insert("placeExternalRef", { ...externalRef, ref: `node/${i + 100}` });
        await ctx.db.insert("placeExternalRef", { ...externalRef, ref: "node/1" });
      });
      expect(await allPages(b)).toEqual([]);
      await expect(b.confirm()).rejects.toMatchObject({ data: { code: "conflict" } });
      expect((await rows(b))[0]?.confirmedPlaceId).toBeUndefined();
      expect(await b.run((ctx) => ctx.db.query("place").take(2))).toHaveLength(1);
    },
  );
  it("focusOnly and category pages retain all other categories when unset", async () => {
    const b = await setup();
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        { ...candidate(2), tags: { name: "Synthetic Library", amenity: "library" } },
        { ...candidate(3), tags: { name: "Synthetic Museum", tourism: "museum", amenity: "" } },
      ]),
    );
    expect(await allPages(b)).toHaveLength(3);
    // Museums are shown on the map (owner, 2026-10-31); a library is not.
    expect(await allPages(b, { focusOnly: true })).toHaveLength(2);
    expect(await allPages(b, { category: "other" })).toHaveLength(1);
    expect(await allPages(b, { category: "other", focusOnly: true })).toHaveLength(0);
  });
  it("confirm creates place + names + pin + external ref with attribution and links the candidate", async () => {
    const b = await setup();
    const pin = { lat: point.lat + 0.001, lng: point.lng + 0.001 };
    const { placeId, slug } = await b
      .as("mock-steward")
      .mutation(f.confirmCandidate, { candidateId: b.id, names, pin, category: "bar" });
    expect(slug).toBe("synthetic-cafe");
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      createdBy: b.steward,
      kind: "business",
      visibility: "draft",
      isMock: true,
      category: "bar",
    });
    const storedNames = await b.run((ctx) =>
      ctx.db
        .query("placeName")
        .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
        .take(12),
    );
    expect(storedNames).toHaveLength(2);
    expect(storedNames.every((name) => name.confirmedBy === b.steward)).toBe(true);
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("pin")
          .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
          .unique(),
      ),
    ).toMatchObject({ ...pin, placedBy: b.steward });
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("placeExternalRef")
          .withIndex("by_placeId_and_provider_and_ref", (q) => q.eq("placeId", placeId))
          .unique(),
      ),
    ).toMatchObject({
      provider: "osm",
      ref: "node/1",
      licence: "ODbL-1.0",
      attribution: "© OpenStreetMap contributors",
      retrievedAt: 123,
    });
    expect((await rows(b))[0]?.confirmedPlaceId).toBe(placeId);
    expect(await b.run((ctx) => ctx.db.query("claim").take(1))).toEqual([]);
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      { action: "osm_candidate.confirm", actorPersonId: b.steward, targetId: b.id },
    ]);
  });
  it("confirm refuses non-stewards, double confirmation, a dismissed candidate, a pin outside the region", async () => {
    const b = await setup();
    const args = { candidateId: b.id, names, pin: point, category: "cafe" };
    await expect(b.as("mock-user").mutation(f.confirmCandidate, args)).rejects.toMatchObject({
      data: { code: "forbidden" },
    });
    await expect(b.t.mutation(f.confirmCandidate, args)).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    });
    await expect(
      b.as("mock-steward").mutation(f.confirmCandidate, { ...args, pin: { lat: 0, lng: 0 } }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    await b.confirm();
    await expect(b.confirm()).rejects.toMatchObject({ data: { code: "conflict" } });
    await b.t.mutation(f.importCandidates, importArgs([candidate(2)]));
    const second = (await rows(b)).find((c) => c.osmId === 2)!;
    await b.as("mock-steward").mutation(f.dismissCandidate, { candidateId: second._id });
    await expect(b.confirm(second._id)).rejects.toMatchObject({ data: { code: "conflict" } });
  });
  it("refuses unknown categories and names without an explicit primary", async () => {
    const b = await setup();
    for (const invalidNames of [
      [],
      names.map((name) => ({ ...name, isPrimary: false })),
      [{ ...names[0]!, value: " " }],
      [names[0]!, names[0]!],
    ])
      await expect(
        b.as("mock-steward").mutation(f.confirmCandidate, {
          candidateId: b.id,
          names: invalidNames,
          pin: point,
          category: "cafe",
        }),
      ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    await expect(
      b.as("mock-steward").mutation(f.confirmCandidate, {
        candidateId: b.id,
        names,
        pin: point,
        category: "unknown",
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    await expect(
      b.as("mock-steward").query(f.listCandidates, { ...pageArgs, category: "unknown" }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    expect(await b.run((ctx) => ctx.db.query("place").take(10))).toEqual([]);
  });
  it("dismiss hides it and audits", async () => {
    const b = await setup();
    await expect(
      b.as("mock-user").mutation(f.dismissCandidate, { candidateId: b.id }),
    ).rejects.toMatchObject({ data: { code: "forbidden" } });
    await b.as("mock-steward").mutation(f.dismissCandidate, { candidateId: b.id });
    expect((await rows(b))[0]?.dismissedAt).toEqual(expect.any(Number));
    expect(await allPages(b)).toEqual([]);
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      { action: "osm_candidate.dismiss", actorPersonId: b.steward, targetId: b.id },
    ]);
    await b.t.mutation(f.importCandidates, importArgs());
    expect(await allPages(b)).toEqual([]);
    await expect(
      b.as("mock-steward").mutation(f.dismissCandidate, { candidateId: b.id }),
    ).rejects.toMatchObject({ data: { code: "conflict" } });
  });
  it("enforces 100 per import and runs the uniqueness trigger", async () => {
    const b = await setup();
    await expect(
      b.t.mutation(
        f.importCandidates,
        importArgs(Array.from({ length: 101 }, (_, i) => candidate(i + 2))),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    await expect(
      b.run((ctx) =>
        ctx.db.insert("seedOsmCandidate", {
          ...candidate(),
          regionId: "nagasaki",
          licence: "ODbL-1.0",
        }),
      ),
    ).rejects.toMatchObject({
      data: { code: "rule_violation", rule: "seed_osm_candidate_unique" },
    });
  });
});

describe("synthetic open listing batch APIs", () => {
  it("listingCandidates paginates all selection fields including linked and dismissed rows", async () => {
    const b = await listingSetup();
    await b.t.mutation(f.importCandidates, importArgs([candidate(2), candidate(3)]));
    await b.t.mutation(f.publishListings, b.args);
    const all = await rows(b);
    await b.run((ctx) => ctx.db.patch("seedOsmCandidate", all[1]!._id, { dismissedAt: 1 }));
    const first = await b.t.query(f.listingCandidates, pageArgs);
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(first.page.find((row) => row._id === b.id)).toMatchObject({
      tags: { name: "架空カフェ" },
      category: "cafe",
      isChain: false,
      confirmedPlaceId: expect.any(String),
      ...point,
    });
    expect(first.page.find((row) => row._id === all[1]!._id)?.dismissedAt).toBe(1);
    const last = await b.t.query(f.listingCandidates, {
      ...pageArgs,
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(last.page).toHaveLength(1);
    expect(last.isDone).toBe(true);
  });

  it("publishListings creates a public place, names, pin, OSM ref, links the candidate and audits the steward", async () => {
    const b = await listingSetup();
    const result = await b.t.mutation(f.publishListings, b.args);
    expect(result.skipped).toEqual([]);
    expect(result.published).toHaveLength(1);
    const { placeId, slug } = result.published[0]!;
    expect(await b.run((ctx) => ctx.db.get("place", placeId))).toMatchObject({
      visibility: "public",
      kind: "business",
      category: "cafe",
      isMock: false,
      createdBy: b.steward,
    });
    const detail = await b.t.query((await import("./_generated/api")).api.places.get, { placeId });
    expect(detail).toMatchObject({
      slug,
      pin: point,
      dataSources: [
        {
          provider: "osm",
          ref: "node/1",
          licence: "ODbL-1.0",
          attribution: "© OpenStreetMap contributors",
        },
      ],
    });
    expect(detail?.names).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lang: "ja",
          value: "架空カフェ",
          script: "kanji",
          isPrimary: true,
        }),
        expect.objectContaining({
          lang: "en",
          value: "Synthetic Cafe",
          script: "latin",
          isPrimary: true,
        }),
      ]),
    );
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("placeName")
          .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
          .take(12),
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ confirmedBy: b.steward })]));
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("pin")
          .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
          .unique(),
      ),
    ).toMatchObject({ ...point, placedBy: b.steward });
    expect(
      await b.run((ctx) =>
        ctx.db
          .query("placeExternalRef")
          .withIndex("by_provider_and_ref", (q) => q.eq("provider", "osm").eq("ref", "node/1"))
          .unique(),
      ),
    ).toMatchObject({ retrievedAt: 123 });
    expect((await rows(b))[0]?.confirmedPlaceId).toBe(placeId);
    expect(await b.run((ctx) => ctx.db.query("claim").take(1))).toEqual([]);
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      {
        action: "osm_listing.publish",
        actorKind: "person",
        actorPersonId: b.steward,
        targetId: placeId,
        diff: { osmRef: "node/1", category: "cafe", candidateId: b.id },
      },
    ]);
  });

  it("refuses a non-steward person id and a missing person", async () => {
    const b = await listingSetup();
    const personId = await addPerson(b, "synthetic-user", "user");
    for (const deleted of [false, true]) {
      if (deleted) await b.run((ctx) => ctx.db.delete("person", personId));
      await expect(
        b.t.mutation(f.publishListings, { ...b.args, stewardPersonId: personId }),
      ).rejects.toMatchObject({ data: { code: "invalid_input" } });
      await expect(
        b.t.mutation(f.dismissDuplicates, {
          regionId: "nagasaki",
          stewardPersonId: personId,
          pairs: [],
        }),
      ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    }
  });

  it("skips an already linked candidate (idempotent)", async () => {
    const b = await listingSetup();
    await b.t.mutation(f.publishListings, b.args);
    expect(await b.t.mutation(f.publishListings, b.args)).toEqual({
      published: [],
      skipped: [{ candidateId: b.id, reason: "already confirmed" }],
    });
    expect(await b.run((ctx) => ctx.db.query("place").take(10))).toHaveLength(1);
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toHaveLength(1);
  });

  it("refuses more than 50", async () => {
    const b = await listingSetup();
    await expect(
      b.t.mutation(f.publishListings, {
        ...b.args,
        candidateIds: Array.from({ length: 51 }, () => b.id),
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    expect(await b.run((ctx) => ctx.db.query("place").take(1))).toEqual([]);
  });

  it.each([
    [{ lat: 0 }, "outside region bbox"],
    [{ regionId: "elsewhere" }, "wrong region"],
    [{ dismissedAt: 0 }, "already dismissed"],
    [{ tags: { "name:ja": "架空" } }, "missing name tag"],
    [{ category: "other" }, "non-focus category"],
    [{ tags: { name: "x".repeat(121) } }, "no valid listing names in region locales"],
  ] as const)("skips an ineligible candidate %j with reason %s", async (patch, reason) => {
    const b = await listingSetup();
    await b.run((ctx) => ctx.db.patch("seedOsmCandidate", b.id, patch));
    expect(await b.t.mutation(f.publishListings, b.args)).toEqual({
      published: [],
      skipped: [{ candidateId: b.id, reason }],
    });
    expect(await b.run((ctx) => ctx.db.query("place").take(1))).toEqual([]);
  });

  it("publishes a chain with a Latin-only name: a brand tag can mark a local brand too", async () => {
    const b = await listingSetup();
    await b.run((ctx) =>
      ctx.db.patch("seedOsmCandidate", b.id, { isChain: true, tags: { name: "Synthetic Brand" } }),
    );
    const result = await b.t.mutation(f.publishListings, b.args);
    expect(result.skipped).toEqual([]);
    expect(result.published).toHaveLength(1);
    const names = await b.run((ctx) => ctx.db.query("placeName").take(5));
    expect(names.map(({ lang, value }) => [lang, value]).sort()).toEqual([
      ["en", "Synthetic Brand"],
      ["ja", "Synthetic Brand"],
    ]);
  });

  it("a re-import files a ryokan and a bath under their new categories, and both publish", async () => {
    const b = await listingSetup();
    // As stored by an import that ran before places to stay and baths were categories.
    await b.run((ctx) =>
      ctx.db.patch("seedOsmCandidate", b.id, {
        category: "other",
        tags: { name: "架空旅館", tourism: "hotel" },
      }),
    );
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        { ...candidate(), tags: { name: "架空旅館", tourism: "hotel" } },
        { ...candidate(2), tags: { name: "架空温泉;かくうの湯", amenity: "public_bath" } },
      ]),
    );
    const candidates = await rows(b);
    expect(candidates.map((row) => row.category).sort()).toEqual(["bath", "stay"]);
    const result = await b.t.mutation(f.publishListings, {
      ...b.args,
      candidateIds: candidates.map((row) => row._id),
    });
    expect(result.skipped).toEqual([]);
    const places = await b.run((ctx) => ctx.db.query("place").take(5));
    expect(places.map((place) => [place.category, place.visibility]).sort()).toEqual([
      ["bath", "public"],
      ["stay", "public"],
    ]);
    const values = (await b.run((ctx) => ctx.db.query("placeName").take(5))).map((n) => n.value);
    expect(values.sort()).toEqual(["架空旅館", "架空温泉 かくうの湯"]);
  });

  it("a re-import files a museum as a museum and keeps a viewpoint a sight; both publish with map copies", async () => {
    const b = await listingSetup();
    // As stored when museums and sights were one hidden category.
    await b.run((ctx) =>
      ctx.db.patch("seedOsmCandidate", b.id, {
        category: "attraction",
        tags: { name: "架空絵本美術館", tourism: "museum" },
      }),
    );
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        { ...candidate(), tags: { name: "架空絵本美術館", tourism: "museum" } },
        { ...candidate(2), tags: { name: "架空展望台", tourism: "viewpoint" } },
      ]),
    );
    const candidates = await rows(b);
    expect(candidates.map((row) => row.category).sort()).toEqual(["attraction", "museum"]);
    const result = await b.t.mutation(f.publishListings, {
      ...b.args,
      candidateIds: candidates.map((row) => row._id),
    });
    expect(result.skipped).toEqual([]);
    const places = await b.run((ctx) => ctx.db.query("place").take(5));
    expect(places.map((place) => [place.category, place.visibility]).sort()).toEqual([
      ["attraction", "public"],
      ["museum", "public"],
    ]);
    for (const place of places) {
      expect(place.mapNames).toEqual([expect.objectContaining({ lang: "ja", isPrimary: true })]);
      expect(place.mapPin).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    }
  });

  it("skips a candidate whose OSM ref is already used", async () => {
    const b = await listingSetup();
    const placeId = await addPlace(b, { createdBy: b.steward });
    await b.run((ctx) =>
      ctx.db.insert("placeExternalRef", {
        placeId,
        provider: "osm",
        ref: "node/1",
        licence: "ODbL-1.0",
        retrievedAt: 1,
      }),
    );
    expect(await b.t.mutation(f.publishListings, b.args)).toEqual({
      published: [],
      skipped: [{ candidateId: b.id, reason: "OSM reference already used" }],
    });
  });

  it("publishes 60 Japanese-only listings across batches without invented names or slug exhaustion", async () => {
    const b = await listingSetup();
    await b.run((ctx) => ctx.db.patch("seedOsmCandidate", b.id, { tags: { name: "架空店1" } }));
    await b.t.mutation(
      f.importCandidates,
      importArgs(
        Array.from({ length: 59 }, (_, i) => ({
          ...candidate(i + 2),
          tags: { name: `架空店${i + 2}`, amenity: "cafe" },
        })),
      ),
    );
    const candidates = await rows(b);
    const first = await b.t.mutation(f.publishListings, {
      ...b.args,
      candidateIds: candidates.slice(0, 50).map((row) => row._id),
    });
    const last = await b.t.mutation(f.publishListings, {
      ...b.args,
      candidateIds: candidates.slice(50).map((row) => row._id),
    });
    expect(first.published).toHaveLength(50);
    expect(last.published).toHaveLength(10);
    expect(new Set([...first.published, ...last.published].map((row) => row.slug)).size).toBe(60);
    expect(await b.run((ctx) => ctx.db.query("placeName").take(100))).toEqual(
      expect.arrayContaining([expect.objectContaining({ lang: "ja", script: "kanji" })]),
    );
    expect(
      (await b.run((ctx) => ctx.db.query("placeName").take(100))).every((row) => row.lang === "ja"),
    ).toBe(true);
  });

  it("dismissDuplicates dismisses and audits, and skips confirmed/dismissed rows on rerun", async () => {
    const b = await listingSetup();
    await b.t.mutation(
      f.importCandidates,
      importArgs([
        { ...candidate(2), osmType: "way", tags: { name: "架空カフェ", amenity: "cafe" } },
      ]),
    );
    const drop = (await rows(b)).find((row) => row.osmId === 2)!._id;
    const args = {
      regionId: "nagasaki",
      stewardPersonId: b.steward,
      pairs: [{ keep: b.id, drop }],
    };
    expect(await b.t.mutation(f.dismissDuplicates, args)).toEqual({ dismissed: 1, skipped: 0 });
    expect(await b.run((ctx) => ctx.db.get("seedOsmCandidate", drop))).toMatchObject({
      dismissedAt: expect.any(Number),
    });
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toMatchObject([
      {
        action: "osm_candidate.dismiss",
        actorPersonId: b.steward,
        targetId: drop,
        diff: { reason: "duplicate", keep: b.id },
      },
    ]);
    expect(await b.t.mutation(f.dismissDuplicates, args)).toEqual({ dismissed: 0, skipped: 1 });
    await b.run((ctx) => ctx.db.patch("seedOsmCandidate", drop, { dismissedAt: undefined }));
    await b.t.mutation(f.publishListings, { ...b.args, candidateIds: [drop] });
    expect(await b.t.mutation(f.dismissDuplicates, args)).toEqual({ dismissed: 0, skipped: 1 });
    await expect(
      b.t.mutation(f.dismissDuplicates, {
        ...args,
        pairs: Array.from({ length: 101 }, () => args.pairs[0]!),
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
  });
});
