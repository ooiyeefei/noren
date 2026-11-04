import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAP_BUDGET,
  DEFAULT_MIN_CONFIDENCE,
  parseFlags,
  readSnapshot,
  runImport,
} from "../../scripts/import-overture-places";
import type { ConvexRunner } from "../../scripts/lib/convex-run";
import { createCliRunner } from "../../scripts/lib/convex-run";
import { MAP_PLACE_LIMIT } from "../../src/lib/domain/constants";

// A fictional snapshot, and a fictional export of a deployment's places, in a scratch folder of the
// project (never /tmp).
const gers = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RELEASE = "2026-10-21.0";
const row = (n: number, extra: Record<string, unknown> = {}) => ({
  id: gers(n),
  lat: 32.6 + n * 0.003,
  lng: 129.88,
  confidence: 0.9,
  operatingStatus: null,
  basicCategory: "cafe",
  taxonomy: { primary: "cafe", hierarchy: ["food_and_drink", "casual_eatery", "cafe"] },
  names: { primary: `架空カフェ${n}`, common: {} },
  brand: null,
  websites: [],
  socials: [],
  addresses: [],
  sources: [{ property: "", dataset: "meta", license: "CDLA-Permissive-2.0", recordId: `m${n}` }],
  ...extra,
});
const lines = (rows: object[]) => rows.map((item) => JSON.stringify(item)).join("\n") + "\n";

let cwd = "";
async function setup(rows: object[], existing: { places?: object[]; refs?: object[] } = {}) {
  const directory = join(cwd, ".scratch/overture", RELEASE);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "places-nagasaki.jsonl"), lines(rows));
  await writeFile(
    join(directory, "places-nagasaki.manifest.json"),
    JSON.stringify({
      release: RELEASE,
      region: "nagasaki",
      count: rows.length,
      retrievedAt: "2026-11-04T00:47:00+00:00",
    }),
  );
  const exportDir = join(cwd, "export");
  await mkdir(exportDir, { recursive: true });
  await writeFile(join(exportDir, "place.jsonl"), lines(existing.places ?? []));
  await writeFile(join(exportDir, "placeName.jsonl"), lines([]));
  await writeFile(join(exportDir, "pin.jsonl"), lines([]));
  await writeFile(join(exportDir, "placeExternalRef.jsonl"), lines(existing.refs ?? []));
}
beforeEach(async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  cwd = await mkdtemp(join(scratch, "overture-import-test-"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const args = (...extra: string[]) => [
  "--region",
  "nagasaki",
  "--release",
  RELEASE,
  "--existing-dir",
  "export",
  "--dry-run",
  ...extra,
];

describe("flags", () => {
  const needs = (argv: string[], message: RegExp) =>
    expect(() => parseFlags(argv)).toThrow(message);

  it("defaults to the region bbox, the measured floor and a budget under the map's limit", () => {
    const flags = parseFlags(args());
    expect(flags).toMatchObject({
      minConfidence: DEFAULT_MIN_CONFIDENCE,
      mapBudget: DEFAULT_MAP_BUDGET,
      bbox: [129.7, 32.55, 130.12, 33.0],
      dryRun: true,
    });
    expect(DEFAULT_MAP_BUDGET).toBeLessThan(MAP_PLACE_LIMIT);
  });

  it("takes the deployment, steward, bbox, floor and budget", () => {
    expect(
      parseFlags([
        "--region",
        "nagasaki",
        "--release",
        RELEASE,
        "--deployment",
        "careful-bee-139",
        "--steward",
        "synthetic-steward",
        "--bbox",
        "129.8,32.65,129.95,32.85",
        "--min-confidence",
        "0.8",
        "--map-budget",
        "3000",
      ]),
    ).toMatchObject({
      deployment: "careful-bee-139",
      steward: "synthetic-steward",
      bbox: [129.8, 32.65, 129.95, 32.85],
      minConfidence: 0.8,
      mapBudget: 3000,
      dryRun: false,
    });
  });

  it("refuses what it cannot run safely", () => {
    needs(["--release", RELEASE, "--dry-run", "--existing-dir", "x"], /--region/);
    needs(["--region", "nagasaki", "--dry-run", "--existing-dir", "x"], /--release/);
    needs(["--region", "nagasaki", "--release", RELEASE, "--dry-run"], /--deployment/);
    needs(["--region", "nagasaki", "--release", RELEASE, "--deployment", "d"], /--steward/);
    needs(["--region", "nagasaki", "--release", RELEASE, "--existing-dir", "x"], /--dry-run only/);
    needs(args("--bbox", "129.8,32.65,129.95"), /west,south,east,north/);
    needs(args("--bbox", "129.0,32.65,129.95,32.85"), /inside the region/);
    needs(args("--min-confidence", "2"), /between 0 and 1/);
    needs(args("--map-budget", String(MAP_PLACE_LIMIT + 1)), /up to/);
    needs(args("--prod"), /Unknown flag/);
    needs(args("--steward"), /Missing value/);
  });
});

describe("snapshot", () => {
  it("reads rows and the retrieval time", async () => {
    await setup([row(1), row(2)]);
    const snapshot = await readSnapshot(cwd, "nagasaki", RELEASE);
    expect(snapshot.places).toHaveLength(2);
    expect(snapshot.retrievedAt).toBe(Date.parse("2026-11-04T00:47:00+00:00"));
  });

  it("points at the fetch script when there is no snapshot", async () => {
    await expect(readSnapshot(cwd, "nagasaki", RELEASE)).rejects.toThrow(/fetch-overture-places/);
  });

  it("refuses a snapshot whose row count differs from its manifest", async () => {
    await setup([row(1), row(2)]);
    await writeFile(
      join(cwd, ".scratch/overture", RELEASE, "places-nagasaki.jsonl"),
      lines([row(1)]),
    );
    await expect(readSnapshot(cwd, "nagasaki", RELEASE)).rejects.toThrow(
      /different number of rows/,
    );
  });
});

describe("dry run", () => {
  it("prints the counts, the duplicates and twenty example names, and writes nothing", async () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => row(i + 1)),
      row(40, { taxonomy: { hierarchy: ["shopping", "convenience_store"] } }),
      row(41, { operatingStatus: "permanently_closed" }),
    ];
    await setup(rows, {
      places: [
        {
          _id: "existing-place",
          regionId: "nagasaki",
          visibility: "public",
          isMock: false,
          category: "cafe",
          mapNames: [{ lang: "ja", script: "kanji", value: "架空カフェ1", isPrimary: true }],
          mapPin: { lat: 32.603, lng: 129.88 },
        },
      ],
      refs: [{ placeId: "existing-place", provider: "osm", ref: "node/1" }],
    });
    const run = vi.fn();
    const log = vi.fn();
    await runImport(args(), { cwd, run: run as unknown as ConvexRunner, log });
    expect(run).not.toHaveBeenCalled();
    const [report] = log.mock.calls[0]!;
    expect(report).toMatchObject({
      release: RELEASE,
      existingPlaces: 1,
      totalInSnapshot: 32,
      inBbox: 32,
      keptAfterCategoryChainAndConfidence: 30,
      keptByCategory: { cafe: 30 },
      duplicatesOfExistingPlaces: 1,
      duplicatesFoundBy: { name: 1 },
      newPlaces: 29,
      newByCategory: { cafe: 29 },
      newByLicence: { "meta CDLA-Permissive-2.0": 29 },
      map: { onMapNow: 1, afterImport: 30, budget: DEFAULT_MAP_BUDGET, withinBudget: true },
      skippedBeforeDuplicateCheck: {
        "not a place to visit (category)": 1,
        "closed or closing": 1,
      },
    });
    expect(report.twentyExampleNewNames).toHaveLength(20);
    expect(report.twentyExampleNewNames[0]).toMatch(/^架空カフェ\d+ \[cafe, confidence 0\.90\]$/);
    expect(log).toHaveBeenCalledWith("Dry run: nothing was written.");
    expect(String(log.mock.calls.at(-1)![0])).toContain("overturemaps.org");
  });
});

describe("import", () => {
  const stewardArgs = [
    "--region",
    "nagasaki",
    "--release",
    RELEASE,
    "--deployment",
    "synthetic-deployment",
    "--steward",
    "synthetic-steward",
  ];
  /** A runner standing in for the deployment: it holds one existing place and records every call. */
  function fakeDeployment(onMap = 1) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const run: ConvexRunner = async (fn, callArgs) => {
      const body = callArgs as Record<string, unknown>;
      calls.push({ fn, args: body });
      if (fn === "overtureSeed:osmChainTags") return { page: [], isDone: true, continueCursor: "" };
      if (fn === "overtureSeed:existingPlaces")
        return {
          page: Array.from({ length: onMap }, (_, i) => ({
            _id: `existing-${i}`,
            category: "cafe",
            onMap: true,
            names: [i === 0 ? "架空カフェ1" : `別の店${i}`],
            pin: i === 0 ? { lat: 32.603, lng: 129.88 } : { lat: 32.99, lng: 129.7 + i / 1000 },
            refs: [{ provider: "osm", ref: `node/${i}` }],
          })),
          isDone: true,
          continueCursor: "",
        };
      if (fn === "overtureSeed:linkDuplicates")
        return { linked: (body.links as unknown[]).length, skipped: [] };
      return { published: body.places, skipped: [] };
    };
    return { run, calls };
  }

  it("links doubles first, then publishes the rest in batches of 50, with the release and time", async () => {
    await setup(Array.from({ length: 120 }, (_, i) => row(i + 1)));
    const { run, calls } = fakeDeployment();
    const log = vi.fn();
    await runImport(stewardArgs, { cwd, run, log });
    const writes = calls.filter((call) => /link|publish/.test(call.fn));
    expect(writes.map((call) => call.fn)).toEqual([
      "overtureSeed:linkDuplicates",
      "overtureSeed:publishPlaces",
      "overtureSeed:publishPlaces",
      "overtureSeed:publishPlaces",
    ]);
    expect((writes[0]!.args.links as unknown[]).length).toBe(1);
    expect(writes.slice(1).map((call) => (call.args.places as unknown[]).length)).toEqual([
      50, 50, 19,
    ]);
    for (const call of writes)
      expect(call.args).toMatchObject({
        regionId: "nagasaki",
        stewardPersonId: "synthetic-steward",
        release: RELEASE,
        retrievedAt: Date.parse("2026-11-04T00:47:00+00:00"),
      });
    const published = writes[1]!.args.places as Record<string, unknown>[];
    expect(Object.keys(published[0]!).sort()).toEqual(
      ["category", "dataset", "gers", "lat", "licence", "lng", "names"].sort(),
    );
    expect(log).toHaveBeenCalledWith({ linked: 1, published: 119, skipped: {} });
  });

  it("reads the existing places and OSM chain names from the deployment page by page", async () => {
    await setup([row(1)]);
    const { run, calls } = fakeDeployment();
    await runImport([...stewardArgs, "--dry-run"], { cwd, run, log: vi.fn() });
    expect(calls.map((call) => call.fn)).toEqual([
      "overtureSeed:existingPlaces",
      "overtureSeed:osmChainTags",
    ]);
    expect(calls[0]!.args).toEqual({
      regionId: "nagasaki",
      paginationOpts: { numItems: 200, cursor: null },
    });
  });

  it("refuses to write when the map would pass the budget, and names the way out", async () => {
    await setup(Array.from({ length: 12 }, (_, i) => row(i + 1)));
    const { run, calls } = fakeDeployment();
    await expect(
      runImport([...stewardArgs, "--map-budget", "10"], { cwd, run, log: vi.fn() }),
    ).rejects.toThrow(/over the budget of 10.*--bbox/);
    expect(calls.some((call) => /link|publish/.test(call.fn))).toBe(false);
  });

  it("restricts to a bbox so the same import fits", async () => {
    await setup(Array.from({ length: 12 }, (_, i) => row(i + 1)));
    const { run, calls } = fakeDeployment();
    // Rows 1 to 5 lie between latitude 32.603 and 32.615.
    await runImport([...stewardArgs, "--map-budget", "10", "--bbox", "129.7,32.55,130.0,32.616"], {
      cwd,
      run,
      log: vi.fn(),
    });
    const published = calls.filter((call) => call.fn === "overtureSeed:publishPlaces");
    expect(published.flatMap((call) => call.args.places as unknown[])).toHaveLength(4);
  });
});

describe("runner", () => {
  it("passes --deployment to the Convex CLI, and refuses it with --prod", async () => {
    const exec = vi.fn((_file, _argv, _options, callback) => callback(null, "{}", ""));
    await createCliRunner({ prod: false, deployment: "careful-bee-139", cwd: "/fixture", exec })(
      "overtureSeed:existingPlaces",
      { regionId: "nagasaki" },
    );
    expect(exec.mock.calls[0]![1]).toEqual([
      "convex",
      "run",
      "overtureSeed:existingPlaces",
      '{"regionId":"nagasaki"}',
      "--deployment",
      "careful-bee-139",
    ]);
    expect(() => createCliRunner({ prod: true, deployment: "x", cwd: "/fixture" })).toThrow();
  });
});
