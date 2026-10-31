import { describe, expect, it, vi } from "vitest";
import { listingNames, selectListings, type ListingCandidate } from "../../src/lib/osm/listings";
import { parseFlags, runPublish } from "../../scripts/publish-osm-listings";
import type { ConvexRunner } from "../../scripts/lib/convex-run";

// All names, identifiers and coordinates here are synthetic test fixtures.
const candidate = (id: number, extra: Partial<ListingCandidate> = {}): ListingCandidate => ({
  _id: `synthetic-${id}`,
  osmType: "node",
  osmId: id,
  category: "cafe",
  tags: { name: "架空カフェ" },
  lat: 32.75,
  lng: 129.88,
  ...extra,
});
const select = (candidates: ListingCandidate[]) =>
  selectListings(candidates, { focusCategories: ["cafe", "shop"] });

describe("synthetic OSM listing selection", () => {
  it("same name within 80 m keeps one; NFKC, whitespace and case are normalized", () => {
    const keep = candidate(1, { tags: { name: "  ＭＯＣＫ　 CAFE " } });
    const drop = candidate(2, { lat: 32.7506, tags: { name: "mock cafe" } });
    expect(select([drop, keep])).toEqual({
      publish: [keep],
      duplicates: [{ keep: keep._id, drop: drop._id }],
      skipped: [],
    });
  });
  it("same name 200 m apart keeps both", () => {
    expect(select([candidate(1), candidate(2, { lat: 32.7518 })]).publish).toHaveLength(2);
  });
  it("different names next to each other keep both", () => {
    expect(
      select([candidate(1), candidate(2, { tags: { name: "架空商店" } })]).publish,
    ).toHaveLength(2);
  });
  it("dismissed, confirmed, nameless and non-focus candidates are skipped with reasons", () => {
    const result = select([
      candidate(2, { dismissedAt: 0 }),
      candidate(3, { confirmedPlaceId: "synthetic-place" }),
      candidate(4, { tags: { "name:ja": "架空" } }),
      candidate(5, { category: "attraction" }),
    ]);
    expect(result.publish).toEqual([]);
    expect(result.skipped.map((row) => row.reason)).toEqual([
      "already dismissed",
      "already confirmed",
      "missing name tag",
      "non-focus category",
    ]);
    expect(new Set(result.skipped.map((row) => row.id)).size).toBe(4);
  });
  it("chains are listed too: a brand tag cannot tell a local brand from a national one", () => {
    expect(select([candidate(1, { isChain: true })])).toMatchObject({
      publish: [{ _id: "synthetic-1" }],
      skipped: [],
    });
  });
  it("derives the category for older candidates without a category field", () => {
    expect(
      select([candidate(1, { category: undefined, tags: { name: "架空", amenity: "cafe" } })])
        .publish,
    ).toHaveLength(1);
  });
  it("the winner is deterministic: more name tags, then node, then lower osmId", () => {
    const rows = [
      candidate(1, { osmType: "way" }),
      candidate(4),
      candidate(2),
      candidate(8, { osmType: "way", tags: { name: "架空カフェ", "name:ja": "架空カフェ" } }),
    ];
    const result = select(rows);
    expect(result.publish.map((row) => row.osmId)).toEqual([8]);
    expect(select([...rows].reverse())).toEqual(result);
    expect(select(rows.slice(0, 3)).publish.map((row) => row.osmId)).toEqual([2]);
    expect(rows.map((row) => row.osmId)).toEqual([1, 4, 2, 8]);
  });
  it("each duplicate is within 80 m of its retained winner, even in a proximity chain", () => {
    expect(
      select([candidate(1), candidate(2, { lat: 32.7506 }), candidate(3, { lat: 32.7512 })])
        .publish,
    ).toHaveLength(2);
  });
});

describe("listing names", () => {
  it("uses Japanese from namesFromTags with its detected script, never inventing a translation", () => {
    expect(listingNames({ name: "架空カフェ", "name:en": "Synthetic Cafe" }, ["ja", "en"])).toEqual(
      [
        { lang: "ja", script: "kanji", value: "架空カフェ", isPrimary: true },
        { lang: "en", script: "latin", value: "Synthetic Cafe", isPrimary: true },
      ],
    );
    // A Latin-only name is the shop's own name in both languages, not a translation.
    expect(listingNames({ name: "Synthetic Cafe" }, ["ja", "en"])).toEqual([
      { lang: "ja", script: "latin", value: "Synthetic Cafe", isPrimary: true },
      { lang: "en", script: "latin", value: "Synthetic Cafe", isPrimary: true },
    ]);
    expect(listingNames({ name: "カクウカフェ" }, ["ja", "en"])).toEqual([
      { lang: "ja", script: "kana", value: "カクウカフェ", isPrimary: true },
    ]);
  });
  it("uses explicit Japanese rather than a translation, one primary per supported language", () => {
    expect(
      listingNames(
        {
          name: "Synthetic",
          "name:ja": "架空",
          "name:ja-Hrkt": "カクウ",
          "name:en": " Synthetic ",
        },
        ["ja"],
      ),
    ).toEqual([{ lang: "ja", script: "kanji", value: "架空", isPrimary: true }]);
  });
  it("shows a name OSM lists as several values (place;bath) as one name, keeping every part", () => {
    expect(
      listingNames({ name: "架空温泉;かくうの湯", "name:en": "Synthetic Spa ; Mock Bath" }, [
        "ja",
        "en",
      ]),
    ).toEqual([
      { lang: "ja", script: "kanji", value: "架空温泉 かくうの湯", isPrimary: true },
      { lang: "en", script: "latin", value: "Synthetic Spa Mock Bath", isPrimary: true },
    ]);
    expect(listingNames({ name: "架空温泉;" }, ["ja"])).toEqual([
      { lang: "ja", script: "kanji", value: "架空温泉", isPrimary: true },
    ]);
  });
});

describe("publication CLI with an offline runner", () => {
  it("--help needs no configuration or network", async () => {
    const run = vi.fn<ConvexRunner>();
    const log = vi.fn();
    await runPublish(["--help"], { cwd: ".", run, log });
    expect(run).not.toHaveBeenCalled();
    expect(log.mock.calls[0]?.[0]).toContain("--steward <personId>");
  });
  it("requires a configured region and a steward, and recognizes dry-run and prod", () => {
    expect(() => parseFlags(["--region", "unknown", "--steward", "synthetic"])).toThrow();
    expect(() => parseFlags(["--region", "nagasaki"])).toThrow("--steward");
    expect(
      parseFlags(["--region", "nagasaki", "--steward", "synthetic", "--dry-run", "--prod"]),
    ).toMatchObject({ prod: true, dryRun: true });
  });
  it("dry-run reads every page including empty pages, prints selection and writes nothing", async () => {
    const run = vi
      .fn<ConvexRunner>()
      .mockResolvedValueOnce({ page: [], isDone: false, continueCursor: "next" })
      .mockResolvedValueOnce({ page: [candidate(1)], isDone: true, continueCursor: "done" });
    const log = vi.fn();
    await runPublish(["--region", "nagasaki", "--steward", "synthetic", "--dry-run"], {
      cwd: ".",
      run,
      log,
    });
    expect(run.mock.calls.map(([fn]) => fn)).toEqual([
      "osmSeed:listingCandidates",
      "osmSeed:listingCandidates",
    ]);
    expect(run.mock.calls[1]?.[1]).toMatchObject({ paginationOpts: { cursor: "next" } });
    expect(log.mock.calls[0]?.[0]).toMatchObject({
      candidates: 1,
      publishable: 1,
      duplicates: 0,
      categories: { cafe: 1 },
      firstFiveNames: ["架空カフェ"],
    });
  });
  it("dismisses 101 duplicates in 100/1 batches, then publishes 102 in 50/50/2 batches", async () => {
    const rows = Array.from({ length: 102 }, (_, i) =>
      candidate(i + 1, { tags: { name: `架空店${i}` } }),
    );
    const duplicates = rows.slice(0, 101).map((row, i) => ({
      ...row,
      _id: `duplicate-${i}`,
      osmType: "way" as const,
      osmId: i + 200,
    }));
    const calls: { fn: string; size: number }[] = [];
    const run: ConvexRunner = async (fn, args) => {
      if (fn === "osmSeed:listingCandidates")
        return { page: [...rows, ...duplicates], isDone: true, continueCursor: "done" };
      const data = args as { pairs?: unknown[]; candidateIds?: unknown[]; stewardPersonId: string };
      expect(data.stewardPersonId).toBe("synthetic");
      const batch = data.pairs ?? data.candidateIds!;
      calls.push({ fn, size: batch.length });
      return data.pairs
        ? { dismissed: batch.length, skipped: 0 }
        : { published: batch, skipped: [] };
    };
    const log = vi.fn();
    await runPublish(["--region", "nagasaki", "--steward", "synthetic"], { cwd: ".", run, log });
    expect(calls).toEqual([
      { fn: "osmSeed:dismissDuplicates", size: 100 },
      { fn: "osmSeed:dismissDuplicates", size: 1 },
      { fn: "osmSeed:publishListings", size: 50 },
      { fn: "osmSeed:publishListings", size: 50 },
      { fn: "osmSeed:publishListings", size: 2 },
    ]);
    expect(log.mock.calls[1]?.[0]).toEqual({
      hidden: 0,
      hideSkipped: 0,
      dismissed: 101,
      dismissalSkipped: 0,
      published: 102,
      publishSkipped: {},
    });
    expect(log.mock.calls.at(-1)?.[0]).toContain("© OpenStreetMap contributors — ODbL-1.0");
  });

  it("takes 101 published errands off the map in 100/1 batches and leaves published places to visit", async () => {
    const errands = Array.from({ length: 101 }, (_, i) =>
      candidate(i + 1, {
        category: "shop",
        tags: { name: `架空マート${i}`, shop: "convenience" },
        confirmedPlaceId: `place-${i}`,
      }),
    );
    const bakery = candidate(500, {
      category: "shop",
      tags: { name: "架空ベーカリー", shop: "bakery" },
      confirmedPlaceId: "place-bakery",
    });
    const calls: { fn: string; ids: unknown[] }[] = [];
    const run: ConvexRunner = async (fn, args) => {
      if (fn === "osmSeed:listingCandidates")
        return { page: [...errands, bakery], isDone: true, continueCursor: "done" };
      const ids = (args as { candidateIds: unknown[] }).candidateIds;
      calls.push({ fn, ids });
      return { hidden: ids.length, skipped: 0 };
    };
    const log = vi.fn();
    await runPublish(["--region", "nagasaki", "--steward", "synthetic"], { cwd: ".", run, log });
    expect(calls.map(({ fn, ids }) => [fn, ids.length])).toEqual([
      ["osmSeed:hideListings", 100],
      ["osmSeed:hideListings", 1],
    ]);
    expect(calls.flatMap(({ ids }) => ids)).not.toContain("synthetic-500");
    expect(log.mock.calls[0]?.[0]).toMatchObject({ publishedErrands: 101 });
    expect(log.mock.calls[1]?.[0]).toMatchObject({ hidden: 101, published: 0 });
  });
});
