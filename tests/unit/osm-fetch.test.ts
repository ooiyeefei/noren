import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fetchOverpass,
  DEFAULT_OVERPASS_ENDPOINT,
  overpassCacheKey,
} from "../../scripts/lib/overpass-fetch";
import { parseFlags, runSeed } from "../../scripts/seed-osm-candidates";

const userAgent = "Noren/0.1 (+https://noren.yooi.me)";
const options = () => ({
  query: "synthetic query",
  endpoint: DEFAULT_OVERPASS_ENDPOINT,
  userAgent,
  fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('{"elements":[]}')),
  sleep: vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined),
});

describe("Overpass fetch (no network)", () => {
  it("the cache key changes when the query changes", () => {
    const input = {
      region: "nagasaki",
      date: "2026-10-30",
      endpoint: DEFAULT_OVERPASS_ENDPOINT,
      query: "synthetic query",
    };
    const key = overpassCacheKey(input);
    expect(key).toMatch(/^nagasaki-2026-10-30-[a-f0-9]{8}\.json$/);
    expect(overpassCacheKey({ ...input })).toBe(key);
    expect(overpassCacheKey({ ...input, query: "different query" })).not.toBe(key);
    expect(
      overpassCacheKey({ ...input, endpoint: "https://example.invalid/interpreter" }),
    ).not.toBe(key);
  });
  it("--refresh ignores the cache", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "noren-osm-refresh-"));
    try {
      const opts = options();
      const log = vi.fn();
      const dependencies = {
        ...opts,
        env: { GEO_USER_AGENT: userAgent },
        cwd,
        now: () => Date.parse("2026-10-30T00:00:00Z"),
        log,
      };
      const argv = ["--region", "nagasaki", "--dry-run"];
      await runSeed(argv, dependencies);
      const directory = join(cwd, ".scratch/osm-cache");
      const [file] = await readdir(directory);
      expect(file).toMatch(/-[a-f0-9]{8}\.json$/);
      const path = join(directory, file!);
      // Refresh must bypass even an unreadable JSON cache, preserving other cache files.
      await writeFile(path, "synthetic corrupt cache");
      const oldPath = join(directory, "nagasaki-2026-10-30.json");
      await writeFile(oldPath, "synthetic old cache");
      opts.fetch.mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              elements: [
                {
                  type: "node",
                  id: 1,
                  lat: 32.75,
                  lon: 129.88,
                  tags: { name: "Synthetic refreshed cafe", amenity: "cafe" },
                },
              ],
            }),
          ),
      );
      await runSeed([...argv, "--refresh"], dependencies);
      expect(opts.fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(await readFile(path, "utf8")).elements).toHaveLength(1);
      expect(await readFile(oldPath, "utf8")).toBe("synthetic old cache");
      await runSeed(argv, dependencies);
      expect(opts.fetch).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ candidates: 1 }));
      await runSeed([...argv, "--endpoint", "https://example.invalid/interpreter"], dependencies);
      expect(opts.fetch).toHaveBeenCalledTimes(3);
      expect(await readdir(directory)).toHaveLength(3);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
  it("sends the User-Agent", async () => {
    const opts = options();
    expect(await fetchOverpass(opts)).toEqual({ elements: [] });
    const [url, init] = opts.fetch.mock.calls[0]!;
    expect(url).toBe(DEFAULT_OVERPASS_ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "User-Agent": userAgent, "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(new URLSearchParams(String(init?.body)).get("data")).toBe(opts.query);
  });
  it.each([429, 406])("retries after 30 s on %i then gives up after 3", async (status) => {
    const opts = options();
    opts.fetch.mockImplementation(async () => new Response("busy", { status }));
    await expect(fetchOverpass(opts)).rejects.toThrow(`HTTP ${status}`);
    expect(opts.fetch).toHaveBeenCalledTimes(4);
    expect(opts.sleep.mock.calls.slice(0, 3)).toEqual([[30_000], [30_000], [30_000]]);
  });
  it("recovers politely from overload and network failure", async () => {
    const opts = options();
    opts.fetch
      .mockRejectedValueOnce(new Error("synthetic offline"))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"elements":[]}'));
    await expect(fetchOverpass(opts)).resolves.toEqual({ elements: [] });
    expect(opts.sleep.mock.calls.slice(0, 2)).toEqual([[30_000], [30_000]]);
  });
  it("refuses a non-https endpoint", async () => {
    const opts = options();
    for (const endpoint of [
      "http://example.invalid",
      "file:///tmp/mock",
      "garbage",
      "https://user:secret@example.invalid",
    ])
      await expect(fetchOverpass({ ...opts, endpoint })).rejects.toThrow(/https/);
    expect(opts.fetch).not.toHaveBeenCalled();
  });
  it("refuses to run without a valid user agent", async () => {
    const opts = options();
    for (const value of ["", "invalid", "Noren/0.1 (mock)"]) {
      await expect(fetchOverpass({ ...opts, userAgent: value })).rejects.toThrow(/GEO_USER_AGENT/);
      await expect(
        runSeed(["--region", "nagasaki", "--dry-run"], {
          env: { GEO_USER_AGENT: value },
          cwd: "/unused",
          fetch: opts.fetch,
          sleep: opts.sleep,
          now: () => 0,
          log: vi.fn(),
        }),
      ).rejects.toThrow(/GEO_USER_AGENT/);
    }
    expect(opts.fetch).not.toHaveBeenCalled();
  });
  it("serializes overlapping helper calls", async () => {
    const opts = options();
    let active = 0;
    let maximum = 0;
    opts.fetch.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return new Response('{"elements":[]}');
    });
    await Promise.all([fetchOverpass(opts), fetchOverpass(opts)]);
    expect(maximum).toBe(1);
  });
  it("rejects partial responses instead of caching missing data", async () => {
    for (const payload of [{}, { elements: [], remark: "synthetic timeout" }]) {
      const opts = options();
      opts.fetch.mockResolvedValue(new Response(JSON.stringify(payload)));
      await expect(fetchOverpass(opts)).rejects.toThrow(/incomplete or invalid/);
    }
  });
  it("help is offline and flags refuse unknown input", async () => {
    const opts = options();
    const log = vi.fn();
    await runSeed(["--help"], { env: {}, cwd: "/unused", ...opts, now: () => 0, log });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("--refresh"));
    expect(opts.fetch).not.toHaveBeenCalled();
    expect(() => parseFlags(["--region", "missing"])).toThrow();
    expect(() => parseFlags(["--region"])).toThrow();
    expect(() => parseFlags(["--unknown"])).toThrow();
    expect(
      parseFlags([
        "--region",
        "nagasaki",
        "--prod",
        "--dry-run",
        "--endpoint",
        "https://example.invalid/interpreter",
      ]),
    ).toMatchObject({ prod: true, dryRun: true });
  });
  it("daily cache, dry run counts and batches of 100 (synthetic data)", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "noren-osm-test-"));
    try {
      const opts = options();
      const raw = {
        elements: Array.from({ length: 205 }, (_, i) => ({
          type: "node",
          id: i + 1,
          lat: 32.75,
          lon: 129.88,
          tags: {
            name: `Synthetic Cafe ${i}`,
            amenity: "cafe",
            ...(i < 5 ? { brand: "Synthetic Brand", "brand:wikidata": "Q123" } : {}),
          },
        })),
      };
      raw.elements.push({
        type: "node",
        id: 999,
        lat: 32.75,
        lon: 129.88,
        tags: { name: "Synthetic noise", amenity: "" },
      });
      opts.fetch.mockImplementation(async () => new Response(JSON.stringify(raw)));
      const run = vi.fn().mockResolvedValue({ inserted: 100, updated: 0, skipped: 0 });
      const log = vi.fn();
      const dependencies = {
        ...opts,
        env: { GEO_USER_AGENT: userAgent },
        cwd,
        now: () => Date.parse("2026-10-30T00:00:00Z"),
        run,
        log,
      };
      await runSeed(["--region", "nagasaki", "--dry-run"], dependencies);
      expect(run).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          candidates: 205,
          categories: { cafe: 205 },
          skipped: 1,
          focusCategories: expect.objectContaining({ cafe: { local: 200, chain: 5 } }),
          firstFiveNames: Array.from({ length: 5 }, (_, i) => ({
            en: `Synthetic Cafe ${i}`,
            primary: `Synthetic Cafe ${i}`,
          })),
        }),
      );
      const [cacheFile] = await readdir(join(cwd, ".scratch/osm-cache"));
      expect(cacheFile).toMatch(/^nagasaki-2026-10-30-[a-f0-9]{8}\.json$/);
      expect(
        JSON.parse(await readFile(join(cwd, ".scratch/osm-cache", cacheFile!), "utf8")),
      ).toEqual(raw);
      await runSeed(["--region", "nagasaki"], dependencies);
      expect(opts.fetch).toHaveBeenCalledTimes(1);
      expect(run.mock.calls.map(([, args]) => args.candidates.length)).toEqual([100, 100, 5]);
      expect(run.mock.calls[0]?.[0]).toBe("osmSeed:importCandidates");
      const imported = run.mock.calls.flatMap(([, args]) => args.candidates);
      expect(imported.map((candidate) => candidate.isChain).filter(Boolean)).toHaveLength(5);
      expect(
        imported.every(
          (candidate) => !Object.keys(candidate.tags).some((key) => key.startsWith("brand")),
        ),
      ).toBe(true);
      expect(log).toHaveBeenLastCalledWith(
        expect.stringContaining("© OpenStreetMap contributors — ODbL-1.0"),
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
