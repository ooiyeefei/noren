import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isWorkerFailure, MAPLIBRE_WORKER_PATH } from "@/components/map/map-helpers";

// The Node ESM script has no TypeScript declaration and must remain directly executable.
const scriptUrl = new URL("../../scripts/copy-maplibre-worker.mjs", import.meta.url).href;
const {
  src: workerSource,
  dest: workerDestination,
  copyIfChanged,
}: {
  src: string;
  dest: string;
  copyIfChanged(src: string, dest: string): { changed: boolean; bytes: number };
} = (await import(scriptUrl)).workerCopyTools();

describe("MapLibre worker configuration", () => {
  it.each([
    [new Error("Worker failed to load"), true],
    [new Error("Tile not found"), false],
    ["Worker failed to load", true],
    ["wOrKeR failed to load", true],
    [{ message: "WORKER failed to load" }, true],
    [{ message: "Tile request failed" }, false],
    [{ message: 42 }, false],
    [{}, false],
    [null, false],
    [undefined, false],
    [42, false],
    ["Style failed to load", false],
  ])("classifies %j as worker failure: %s", (error, expected) => {
    expect(isWorkerFailure(error)).toBe(expected);
  });

  it("uses a same-origin module worker path matching the copy destination", () => {
    expect(MAPLIBRE_WORKER_PATH).toBe("/maplibre/maplibre-gl-worker.mjs");
    expect(MAPLIBRE_WORKER_PATH.startsWith("/")).toBe(true);
    expect(MAPLIBRE_WORKER_PATH.endsWith(".mjs")).toBe(true);
    expect(workerSource).toBe(
      fileURLToPath(
        new URL("../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url),
      ),
    );
    expect(workerDestination).toBe(
      fileURLToPath(new URL(`../../public${MAPLIBRE_WORKER_PATH}`, import.meta.url)),
    );
  });
});

describe("worker copy", () => {
  let directory: string;
  let source: string;
  let destination: string;

  beforeEach(() => {
    const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
    mkdirSync(scratch, { recursive: true });
    directory = mkdtempSync(join(scratch, "maplibre-worker-test-"));
    source = join(directory, "source.mjs");
    destination = join(directory, "public", "maplibre", "worker.mjs");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("creates the destination directories and copies every byte", () => {
    const content = Buffer.from("// mock worker\nself.onmessage = () => {};\n");
    writeFileSync(source, content);
    expect(copyIfChanged(source, destination)).toEqual({ changed: true, bytes: content.length });
    expect(readFileSync(destination)).toEqual(content);
  });

  it("skips an identical copy without touching its modification time", () => {
    writeFileSync(source, "mock worker");
    copyIfChanged(source, destination);
    utimesSync(destination, new Date(1000), new Date(1000));
    const before = statSync(destination).mtimeMs;
    expect(copyIfChanged(source, destination)).toEqual({ changed: false, bytes: 11 });
    expect(statSync(destination).mtimeMs).toBe(before);
  });

  it("replaces different content even when the size is unchanged", () => {
    writeFileSync(source, "first");
    copyIfChanged(source, destination);
    writeFileSync(source, "other");
    expect(copyIfChanged(source, destination)).toEqual({ changed: true, bytes: 5 });
    expect(readFileSync(destination, "utf8")).toBe("other");
    writeFileSync(source, "longer mock worker");
    expect(copyIfChanged(source, destination).changed).toBe(true);
    expect(readFileSync(destination, "utf8")).toBe("longer mock worker");
  });

  it("rejects a missing source and names its path", () => {
    expect(() => copyIfChanged(source, destination)).toThrow(source);
  });

  it("rejects an empty source and preserves the existing destination", () => {
    writeFileSync(source, "valid mock worker");
    copyIfChanged(source, destination);
    writeFileSync(source, "");
    expect(() => copyIfChanged(source, destination)).toThrow(`source is empty: ${source}`);
    expect(readFileSync(destination, "utf8")).toBe("valid mock worker");
  });
});
