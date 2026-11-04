import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseFlags, runHideChains } from "../../scripts/hide-chains";
import { EXPORT_LIMIT, EXPORT_TABLES, type ExecLike } from "../../scripts/lib/chain-export";
import type { ConvexRunner } from "../../scripts/lib/convex-run";
import type { NsiData } from "../../src/lib/chains/nsi";

// A fictional snapshot, export and brand list, in a scratch folder of the project (never /tmp).
const RELEASE = "2026-10-21.0";
const gers = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lines = (rows: object[]) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
const nsi = {
  data: {
    _meta: { version: "9.9.20990101" },
    nsi: {
      "brands/amenity/restaurant": {
        items: [
          {
            id: "mimosa-1",
            displayName: "ミモザ食堂",
            locationSet: { include: ["jp"] },
            tags: { brand: "ミモザ食堂" },
          },
        ],
      },
    },
  } satisfies NsiData,
  features: new Map(),
  version: "9.9.20990101",
  downloaded: false,
};

let cwd = "";
const record = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
  id: gers(n),
  lat: 32.6 + n * 0.01,
  lng: 129.8,
  names: { primary: name, common: {} },
  brand: null,
  addresses: [],
  ...extra,
});
const place = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
  _id: `place${n}`,
  regionId: "nagasaki",
  visibility: "public",
  isMock: false,
  category: "restaurant",
  mapNames: [{ lang: "ja", script: "kanji", value: name, isPrimary: true }],
  ...extra,
});

async function setup(options: {
  places: object[];
  snapshot?: object[];
  refs?: object[];
  stories?: object[];
}) {
  const snapshot = options.snapshot ?? [];
  const directory = join(cwd, "snapshot");
  await mkdir(directory, { recursive: true });
  const body = lines(snapshot);
  await writeFile(join(directory, "places-nagasaki.jsonl"), body);
  await writeFile(
    join(directory, "places-nagasaki.manifest.json"),
    JSON.stringify({
      release: RELEASE,
      region: "nagasaki",
      count: snapshot.length,
      sha256: createHash("sha256").update(body).digest("hex"),
    }),
  );
  const exportDir = join(cwd, "export");
  await mkdir(exportDir, { recursive: true });
  for (const table of EXPORT_TABLES) await writeFile(join(exportDir, `${table}.jsonl`), lines([]));
  await writeFile(join(exportDir, "place.jsonl"), lines(options.places));
  await writeFile(join(exportDir, "placeExternalRef.jsonl"), lines(options.refs ?? []));
  await writeFile(join(exportDir, "story.jsonl"), lines(options.stories ?? []));
}

beforeEach(async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  cwd = await mkdtemp(join(scratch, "hide-chains-test-"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const base = [
  "--export-dir",
  "export",
  "--snapshot",
  "snapshot/places-nagasaki.jsonl",
  "--evidence",
  "none.json",
];

describe("flags", () => {
  const needs = (argv: string[], message: RegExp) =>
    expect(() => parseFlags(argv)).toThrow(message);

  it("needs a deployment or an export, and a steward for a real run", () => {
    needs(["--dry-run"], /--deployment <name> is required/);
    needs(["--deployment", "d"], /--steward <personId> is required/);
    expect(parseFlags(["--deployment", "d", "--dry-run"])).toMatchObject({
      deployment: "d",
      dryRun: true,
    });
    expect(parseFlags(["--deployment", "d", "--steward", "s"])).toMatchObject({
      steward: "s",
      dryRun: false,
    });
  });

  it("reads a saved export only for a dry run", () => {
    needs(["--export-dir", "x", "--steward", "s"], /for --dry-run only/);
  });

  it("refuses an unknown flag, a missing value and an unknown region", () => {
    needs(["--nope"], /Unknown flag --nope/);
    needs(["--deployment"], /Missing value for --deployment/);
    needs(["--deployment", "d", "--dry-run", "--region", "atlantis"], /configured region/);
  });
});

describe("a dry run", () => {
  it("counts by signal and category, lists every match, writes the reports, and changes nothing", async () => {
    await setup({
      snapshot: [
        record(1, "ミモザ食堂 大村店"),
        record(2, "ミモザ食堂 時津店"),
        record(3, "独立珈琲", { brand: { name: "架空ブランド" } }),
        ...["大村", "時津", "諫早"].map((area, i) => record(10 + i, `地元亭 ${area}店`)),
      ],
      places: [
        place(1, "ミモザ食堂 大村店"),
        place(2, "独立珈琲", { category: "cafe" }),
        place(3, "地元亭 大村店"),
        place(4, "町の食堂"),
        place(5, "ミモザ食堂 時津店"),
        place(6, "ミモザ食堂", { hiddenReason: "not_for_visitors", visibility: "draft" }),
      ],
      refs: [{ placeId: "place2", provider: "overture", ref: gers(3) }],
      stories: [{ placeId: "place5" }],
    });
    const log = vi.fn();
    const run = vi.fn();
    await runHideChains(["--dry-run", ...base], {
      cwd,
      run: run as unknown as ConvexRunner,
      nsi: async () => nsi,
      log,
    });
    expect(run).not.toHaveBeenCalled();
    const printed = log.mock.calls.map(([value]) => value);
    expect(printed[0]).toMatchObject({
      publicPlaces: 5,
      toHide: 2,
      sparedAsLocalMultiBranch: 1,
      keptBecauseStoriesPostsOrOwner: 1,
      bySignal: {
        brand_list: { places: 1, onlyThisSignal: 1 },
        overture_brand: { places: 1, onlyThisSignal: 1 },
        branch_pattern: { places: 0 },
      },
    });
    expect(
      printed.filter((line) => typeof line === "string" && line.startsWith("HIDE")),
    ).toHaveLength(2);
    expect(printed).toContainEqual(expect.stringContaining("SPARE 地元亭 大村店 | restaurant"));
    expect(printed).toContainEqual(
      expect.stringContaining("KEPT  ミモザ食堂 時津店 | restaurant | kept: has a story"),
    );
    const json = JSON.parse(await readFile(join(cwd, ".scratch/chains-report.json"), "utf8"));
    expect(json.hide.map((match: { name: string }) => match.name).sort()).toEqual([
      "ミモザ食堂 大村店",
      "独立珈琲",
    ]);
    expect(json.spared).toHaveLength(1);
    expect(json.kept).toHaveLength(1);
    const markdown = await readFile(join(cwd, ".scratch/chains-report.md"), "utf8");
    expect(markdown).toContain("| 独立珈琲 | cafe | Overture brand field: 架空ブランド |");
    expect(markdown).toContain("Spared by the local multi-branch rule (1)");
    const request = JSON.parse(
      await readFile(join(cwd, ".scratch/chains-evidence-request.json"), "utf8"),
    );
    expect(request.bases.map((item: { base: string }) => item.base)).toContain("地元亭");
  });
});

describe("a real run", () => {
  it("hides in batches of fifty with the reasons, and writes nothing without a steward", async () => {
    const names = Array.from({ length: 120 }, (_, i) => `ミモザ食堂 架空${i}店`);
    await setup({ places: names.map((name, i) => place(i, name)) });
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const run: ConvexRunner = async (fn, args) => {
      calls.push({ fn, args: args as Record<string, unknown> });
      const count = (args as { places: unknown[] }).places.length;
      return { hidden: count - 1, alreadyHidden: 1, skipped: [] };
    };
    const log = vi.fn();
    await runHideChains(
      [
        "--deployment",
        "d",
        "--snapshot",
        "snapshot/places-nagasaki.jsonl",
        "--evidence",
        "none.json",
        "--steward",
        "stewardId",
      ],
      {
        cwd,
        run,
        // The deployment's tables, as `npx convex data` prints them.
        exec: ((file, args, _options, callback) => {
          const table = args[2]!;
          const rows = table === "place" ? names.map((name, i) => place(i, name)) : [];
          callback(null, rows.length ? lines(rows) : "There are no documents in this table.\n", "");
        }) as ExecLike,
        nsi: async () => nsi,
        log,
      },
    );
    expect(calls.map((call) => call.fn)).toEqual([
      "chains:hideChains",
      "chains:hideChains",
      "chains:hideChains",
    ]);
    expect(calls.map((call) => (call.args.places as unknown[]).length)).toEqual([50, 50, 20]);
    expect(calls[0]!.args).toMatchObject({
      regionId: "nagasaki",
      stewardPersonId: "stewardId",
      basis: "Name Suggestion Index 9.9.20990101; Overture 2026-10-21.0",
    });
    expect((calls[0]!.args.places as { signals: { kind: string }[] }[])[0]!.signals[0]!.kind).toBe(
      "brand_list",
    );
    expect(log).toHaveBeenLastCalledWith({ hidden: 117, alreadyHidden: 3, skipped: {} });
  });

  it("reads a deployment only with `convex data`, which changes nothing", async () => {
    await setup({ places: [] });
    const executed: string[][] = [];
    await runHideChains(
      [
        "--deployment",
        "d",
        "--dry-run",
        "--snapshot",
        "snapshot/places-nagasaki.jsonl",
        "--evidence",
        "none.json",
      ],
      {
        cwd,
        exec: ((file, args, _options, callback) => {
          executed.push([file, ...args]);
          callback(null, "There are no documents in this table.\n", "");
        }) as ExecLike,
        nsi: async () => nsi,
        log: vi.fn(),
      },
    );
    expect(executed).toHaveLength(EXPORT_TABLES.length);
    for (const call of executed) {
      expect(call.slice(0, 3)).toEqual(["npx", "convex", "data"]);
      expect(call).toContain("--deployment");
      expect(call).not.toContain("run");
    }
  });

  it("refuses an export that fills the row limit", async () => {
    await setup({ places: [] });
    const full = Array.from({ length: EXPORT_LIMIT }, (_, i) => `{"_id":"${i}"}`).join("\n");
    await expect(
      runHideChains(
        ["--deployment", "d", "--dry-run", "--snapshot", "snapshot/places-nagasaki.jsonl"],
        {
          cwd,
          exec: ((file, args, _options, callback) => callback(null, full, "")) as ExecLike,
          nsi: async () => nsi,
          log: vi.fn(),
        },
      ),
    ).rejects.toThrow(/raise EXPORT_LIMIT/);
  });
});
