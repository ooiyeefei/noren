import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// The region index reads region files from disk, so a browser bundle cannot include it; a value
// import from a client file broke the production build once. Types are erased and are fine.
it("no client file imports values from the region index", () => {
  const offenders = sourceFiles(SRC).filter((file) => {
    const text = readFileSync(file, "utf8");
    if (!/^["']use client["'];?/m.test(text)) return false;
    return /^import\s+(?!type\b)[^;]*from\s+["']@\/lib\/region["'];?$/m.test(text);
  });
  expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
});
