import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readEvidence } from "../../scripts/lib/chain-evidence";
import { readChainSnapshot } from "../../scripts/lib/chain-snapshot";
import { loadNsi, NSI_FILES, NSI_VERSION } from "../../scripts/lib/nsi-cache";

// Fictional files in a scratch folder of the project (never /tmp).
let cwd = "";
beforeEach(async () => {
  const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  cwd = await mkdtemp(join(scratch, "chains-io-test-"));
});
afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const row = (id: string, name: string, extra: object = {}) =>
  JSON.stringify({
    id,
    lat: 32.7,
    lng: 129.8,
    names: { primary: name },
    brand: null,
    addresses: [],
    ...extra,
  });

async function snapshot(rows: string[], manifest: Record<string, unknown> = {}) {
  const body = rows.join("\n") + "\n";
  await writeFile(join(cwd, "places.jsonl"), body);
  await writeFile(
    join(cwd, "places.manifest.json"),
    JSON.stringify({
      release: "2026-10-21.0",
      region: "nagasaki",
      count: rows.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      ...manifest,
    }),
  );
  return join(cwd, "places.jsonl");
}

describe("readChainSnapshot", () => {
  it("reads names, brands and prefectures, and checks the manifest", async () => {
    const path = await snapshot([
      row("a", "ミモザ食堂"),
      row("b", "独立珈琲", {
        brand: { name: "架空", wikidata: null },
        addresses: [{ region: "熊本県" }],
      }),
      row("c", "地元亭", {
        brand: { name: null, wikidata: null },
        addresses: [{ postcode: "850-0001" }],
      }),
    ]);
    const { records, release, count } = await readChainSnapshot(path);
    expect(release).toBe("2026-10-21.0");
    expect(count).toBe(3);
    expect(records).toMatchObject([
      { id: "a", name: "ミモザ食堂", brand: null, prefecture: "unknown" },
      { id: "b", brand: { name: "架空", wikidata: null }, prefecture: "other" },
      { id: "c", brand: null, prefecture: "nagasaki" },
    ]);
  });

  it("refuses a file that does not match its manifest", async () => {
    const path = await snapshot([row("a", "ミモザ食堂")], { sha256: "0".repeat(64) });
    await expect(readChainSnapshot(path)).rejects.toThrow(/SHA-256/);
    const counted = await snapshot([row("a", "ミモザ食堂")], { count: 2 });
    await expect(readChainSnapshot(counted)).rejects.toThrow(/counts 2/);
  });

  it("refuses a snapshot with no manifest", async () => {
    await writeFile(join(cwd, "lonely.jsonl"), "");
    await expect(readChainSnapshot(join(cwd, "lonely.jsonl"))).rejects.toThrow(/No manifest/);
  });
});

describe("readEvidence", () => {
  const write = (file: object) => writeFile(join(cwd, "evidence.json"), JSON.stringify(file));

  it("reads the counts, and reads a missing file as no evidence", async () => {
    await write({
      release: "2026-10-21.0",
      bases: { みもざ: { base: "ミモザ", outside: 7, examples: [] } },
    });
    const { evidence } = await readEvidence(join(cwd, "evidence.json"), "2026-10-21.0");
    expect(evidence?.get("みもざ")).toEqual({ outside: 7 });
    expect((await readEvidence(join(cwd, "absent.json"), "2026-10-21.0")).evidence).toBeUndefined();
  });

  it("refuses evidence for another release or with a bad count", async () => {
    await write({ release: "2026-09-17.0", bases: {} });
    await expect(readEvidence(join(cwd, "evidence.json"), "2026-10-21.0")).rejects.toThrow(
      /release 2026-09-17.0/,
    );
    await write({
      release: "2026-10-21.0",
      bases: { x: { base: "x", outside: -1, examples: [] } },
    });
    await expect(readEvidence(join(cwd, "evidence.json"), "2026-10-21.0")).rejects.toThrow(
      /whole number/,
    );
  });
});

describe("loadNsi", () => {
  it("pins the release and a SHA-256 for each file", () => {
    expect(NSI_VERSION).toMatch(/^\d+\.\d+\.\d{8}$/);
    for (const hash of Object.values(NSI_FILES)) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses a download that does not match the pinned hash, and keeps nothing", async () => {
    const fetchBytes = vi.fn(async () => new TextEncoder().encode("{}"));
    await expect(loadNsi(cwd, fetchBytes)).rejects.toThrow(/pinned SHA-256/);
    expect(fetchBytes).toHaveBeenCalledWith(
      `https://cdn.jsdelivr.net/npm/name-suggestion-index@${NSI_VERSION}/dist/json/nsi.min.json`,
    );
    const again = vi.fn(async () => new TextEncoder().encode("{}"));
    await expect(loadNsi(cwd, again)).rejects.toThrow(/pinned SHA-256/);
    expect(again).toHaveBeenCalled();
  });
});
