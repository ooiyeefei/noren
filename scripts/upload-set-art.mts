/**
 * Slices a set's approved picture into one image per panel and uploads those and the whole picture
 * to file storage, where the app sends each only to someone who has earned it (FR-103). The picture
 * stays out of this repository, because the repository is public and it would spoil the surprise.
 * The set must exist first (collection:createSet).
 *
 *   npx tsx scripts/upload-set-art.mts <neighbourhood> <picture.png> [--prod] [--dry-run <folder>]
 *
 * Without --prod it writes to the dev deployment. --dry-run writes the slices to a folder instead.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { activeRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, type ConvexRunner } from "./lib/convex-run";

const USAGE =
  "Usage: npx tsx scripts/upload-set-art.mts <neighbourhood> <picture.png> [--prod] [--dry-run <folder>]";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let prod = false;
  let dryRun: string | undefined;
  for (let at = 0; at < argv.length; at += 1) {
    const value = argv[at]!;
    if (value === "--prod") prod = true;
    else if (value === "--dry-run") dryRun = argv[(at += 1)];
    else if (value.startsWith("--")) throw new Error(`Unknown flag ${value}\n${USAGE}`);
    else positional.push(value);
  }
  const [neighbourhoodId, picture] = positional;
  if (!neighbourhoodId || !picture || positional.length > 2 || argv.at(-1) === "--dry-run") {
    throw new Error(USAGE);
  }
  return { neighbourhoodId, picture, prod, dryRun };
}

async function upload(run: ConvexRunner, image: Buffer): Promise<string> {
  const url = (await run("collection:generateArtUploadUrl", {})) as string;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: new Uint8Array(image),
  });
  if (!response.ok) throw new Error(`upload answered ${response.status}`);
  const { storageId } = (await response.json()) as { storageId: string };
  return storageId;
}

async function main() {
  const { neighbourhoodId, picture, prod, dryRun } = parseArgs(process.argv.slice(2));
  const region = activeRegionConfig();
  const panels = region.collection.panelsPerSet;
  const { width, height } = await sharp(picture).metadata();
  if (!width || !height) throw new Error(`${picture} has no size`);
  if (width % panels !== 0) throw new Error(`${width} px does not divide into ${panels} panels`);
  const panelWidth = width / panels;
  const slices = await Promise.all(
    Array.from({ length: panels }, (_, index) =>
      sharp(picture)
        .extract({ left: index * panelWidth, top: 0, width: panelWidth, height })
        .png()
        .toBuffer(),
    ),
  );
  const whole = await sharp(picture).png().toBuffer();
  if (dryRun) {
    await mkdir(dryRun, { recursive: true });
    await writeFile(join(dryRun, "whole.png"), whole);
    await Promise.all(
      slices.map((slice, index) => writeFile(join(dryRun, `panel-${index + 1}.png`), slice)),
    );
    console.log(`wrote ${panels} panels and the whole picture to ${dryRun}`);
    return;
  }
  console.log(`uploading to ${prod ? "production" : "the dev deployment"}`);
  const run = createCliRunner({ prod, cwd: process.cwd() });
  const where = { regionId: region.id, neighbourhoodId };
  for (const [index, slice] of slices.entries()) {
    const storageId = await upload(run, slice);
    await run("collection:attachArt", { ...where, panelIndex: index, storageId });
    console.log(`panel ${index + 1} uploaded`);
  }
  const storageId = await upload(run, whole);
  await run("collection:attachArt", { ...where, panelIndex: null, storageId });
  console.log("whole picture uploaded");
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`upload-set-art failed (${detail})`);
  process.exitCode = 1;
});
