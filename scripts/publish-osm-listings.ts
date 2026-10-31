import { pathToFileURL } from "node:url";
import { categoryForTags, isForVisitors } from "../src/lib/osm/categories";
import { selectListings, type ListingCandidate } from "../src/lib/osm/listings";
import { getRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, type ConvexRunner } from "./lib/convex-run";

const attribution =
  "© OpenStreetMap contributors — ODbL-1.0 — https://www.openstreetmap.org/copyright";

export function parseFlags(argv: readonly string[]) {
  let region = "";
  let steward = "";
  let dryRun = false;
  let prod = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--dry-run") dryRun = true;
    else if (flag === "--prod") prod = true;
    else if (flag === "--region" || flag === "--steward") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      if (flag === "--region") region = value;
      else steward = value;
    } else throw new Error("Unknown flag; use --help");
  }
  if (!getRegionConfig(region)) throw new Error("--region must name a configured region");
  if (!steward) throw new Error("--steward <personId> is required");
  return { region, steward, dryRun, prod };
}

type CandidatePage = { page: ListingCandidate[]; isDone: boolean; continueCursor: string };
type PublishResult = { published: unknown[]; skipped: { reason: string }[] };

function countReasons(skipped: readonly { reason: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { reason } of skipped) counts[reason] = (counts[reason] ?? 0) + 1;
  return counts;
}
type DismissResult = { dismissed: number; skipped: number };

export async function runPublish(
  argv: readonly string[],
  options: { cwd: string; run?: ConvexRunner; log: (value: unknown) => void },
) {
  if (argv.includes("--help")) {
    options.log(
      "Usage: npx tsx scripts/publish-osm-listings.ts --region nagasaki --steward <personId> [--dry-run] [--prod]\nUses Convex admin CLI credentials. --steward must name an existing steward acting on the owner's explicit instruction. Dry run reads all candidate pages and writes nothing. Without --dry-run, takes published errands off the map (batches of 100), dismisses duplicates in batches of 100 and publishes listings in batches of 50. --prod targets production; otherwise uses the configured development deployment. Does not change the launch pack, invite-only access or noindex.",
    );
    options.log(attribution);
    return;
  }
  const flags = parseFlags(argv);
  const region = getRegionConfig(flags.region)!;
  const run = options.run ?? createCliRunner({ prod: flags.prod, cwd: options.cwd });
  const candidates: ListingCandidate[] = [];
  let cursor: string | null = null;
  do {
    const page = (await run("osmSeed:listingCandidates", {
      regionId: region.id,
      paginationOpts: { numItems: 200, cursor },
    })) as CandidatePage;
    candidates.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor !== null);
  const selection = selectListings(candidates, {
    focusCategories:
      region.categories?.filter((category) => category.focus).map((category) => category.key) ?? [],
  });
  // Listings published before the errand rule existed; the mutation checks each one again.
  const errands = candidates.filter(
    (candidate) =>
      candidate.confirmedPlaceId !== undefined &&
      !isForVisitors(candidate.tags, candidate.isChain === true),
  );
  const categories: Record<string, number> = {};
  for (const candidate of selection.publish) {
    const category = candidate.category ?? categoryForTags(candidate.tags);
    categories[category] = (categories[category] ?? 0) + 1;
  }
  options.log({
    candidates: candidates.length,
    publishable: selection.publish.length,
    categories,
    duplicates: selection.duplicates.length,
    skipped: countReasons(selection.skipped),
    firstFiveNames: selection.publish.slice(0, 5).map((candidate) => candidate.tags.name),
    publishedErrands: errands.length,
  });
  if (!flags.dryRun) {
    const args = { regionId: region.id, stewardPersonId: flags.steward };
    const totals = { hidden: 0, hideSkipped: 0, dismissed: 0, dismissalSkipped: 0, published: 0 };
    for (let i = 0; i < errands.length; i += 100) {
      const result = (await run("osmSeed:hideListings", {
        ...args,
        candidateIds: errands.slice(i, i + 100).map((candidate) => candidate._id),
      })) as { hidden: number; skipped: number };
      totals.hidden += result.hidden;
      totals.hideSkipped += result.skipped;
    }
    const publishSkipped: { reason: string }[] = [];
    for (let i = 0; i < selection.duplicates.length; i += 100) {
      const result = (await run("osmSeed:dismissDuplicates", {
        ...args,
        pairs: selection.duplicates.slice(i, i + 100),
      })) as DismissResult;
      totals.dismissed += result.dismissed;
      totals.dismissalSkipped += result.skipped;
    }
    for (let i = 0; i < selection.publish.length; i += 50) {
      const result = (await run("osmSeed:publishListings", {
        ...args,
        candidateIds: selection.publish.slice(i, i + 50).map((candidate) => candidate._id),
      })) as PublishResult;
      totals.published += result.published.length;
      publishSkipped.push(...result.skipped);
    }
    options.log({ ...totals, publishSkipped: countReasons(publishSkipped) });
  }
  options.log(attribution);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runPublish(process.argv.slice(2), { cwd: process.cwd(), log: console.log }).catch(
    (error: unknown) => {
      // The runner rejects with the Convex CLI's stderr (function errors), which carries no credentials.
      console.error(
        error instanceof Error
          ? `OSM listing publication failed: ${error.name}: ${error.message || "(no message)"}`
          : `OSM listing publication failed: ${String(error)}`,
      );
      process.exitCode = 1;
    },
  );
