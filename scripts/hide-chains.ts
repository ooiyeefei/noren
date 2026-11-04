/**
 * Takes chain businesses off the public map. Noren maps independent places worth a visit; people who
 * want chains use Google Maps. No AI model decides anything here: each hidden place carries a reason
 * from open data and a fixed rule.
 *
 *  (a) Brand list: the place's name equals or starts with a brand name or alias (Japanese, English,
 *      kana, at least three characters) of the OSM Name Suggestion Index (BSD-3-Clause, pinned in
 *      scripts/lib/nsi-cache.ts), for a brand that operates in Japan and whose kind of business fits
 *      the place's category (src/lib/chains/nsi.ts).
 *  (b) Branch pattern: the name without its branch suffix (大村店, 支店, 号店, "Branch", "Store") is
 *      shared by three or more places, one with a suffix. The places counted are those of the whole
 *      Overture snapshot of Nagasaki (errands included) and, from scripts/data/chain-evidence-japan.json
 *      (scripts/fetch-chain-evidence.py), the branches Overture lists outside Nagasaki prefecture.
 *      A base name found only in Nagasaki and fewer than five times is a local multi-branch place and
 *      is spared (src/lib/chains/local.ts).
 *  Two more reasons spare a place that a signal would hide, a brand of the Name Suggestion Index
 *  included: it is Nagasaki-born (Nagasaki prefecture holds 30% or more of the places that carry its
 *  name in Japan, counted from the snapshot and the Japan-wide evidence), or its name marks the head
 *  shop (本店, 総本店, 本家).
 *  (c) The Overture brand field of a place's Overture record.
 *
 * A place with a story, a linked post or a confirmed owner is never hidden, here or in the mutation
 * (convex/chains.ts), which hides through the same path as an errand (hiddenReason not_for_visitors).
 *
 * Usage (see --help): a dry run reads the deployment with `npx convex data`, which changes nothing, and
 * writes .scratch/chains-report.json and .md; without --dry-run it calls chains:hideChains.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GENERIC_SUFFIXES } from "../src/lib/chains/branch";
import { nsiBrands, type NsiStats } from "../src/lib/chains/nsi";
import {
  planChains,
  type ChainPlan,
  type PlaceMatch,
  type PublicPlace,
  type SignalKind,
  type SpareRule,
} from "../src/lib/chains/plan";
import { getRegionConfig } from "../src/lib/region/registry";
import { readChainSnapshot } from "./lib/chain-snapshot";
import { EVIDENCE_PATH, readEvidence } from "./lib/chain-evidence";
import { exportFromDeployment, readPublicPlaces, type ExecLike } from "./lib/chain-export";
import { createCliRunner, type ConvexRunner } from "./lib/convex-run";
import { loadNsi } from "./lib/nsi-cache";

export const DEFAULT_SNAPSHOT = ".scratch/overture/2026-10-21.0/places-nagasaki.jsonl";
const HIDE_BATCH = 50;
const SIGNAL_KINDS: readonly SignalKind[] = ["brand_list", "branch_pattern", "overture_brand"];
const SIGNAL_LABEL: Record<SignalKind, string> = {
  brand_list: "(a) brand list (NSI)",
  branch_pattern: "(b) branch pattern",
  overture_brand: "(c) Overture brand field",
};

export function parseFlags(argv: readonly string[]) {
  const flags = {
    region: "nagasaki",
    deployment: undefined as string | undefined,
    steward: undefined as string | undefined,
    exportDir: undefined as string | undefined,
    snapshot: DEFAULT_SNAPSHOT,
    evidence: EVIDENCE_PATH,
    outDir: ".scratch",
    dryRun: false,
  };
  const valued = [
    "--region",
    "--deployment",
    "--steward",
    "--export-dir",
    "--snapshot",
    "--evidence",
    "--out-dir",
  ];
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] ?? "";
    if (flag === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (!valued.includes(flag)) throw new Error(`Unknown flag ${flag}; use --help`);
    const value = argv[++i];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--region") flags.region = value;
    else if (flag === "--deployment") flags.deployment = value;
    else if (flag === "--steward") flags.steward = value;
    else if (flag === "--export-dir") flags.exportDir = value;
    else if (flag === "--snapshot") flags.snapshot = value;
    else if (flag === "--evidence") flags.evidence = value;
    else flags.outDir = value;
  }
  if (!getRegionConfig(flags.region)) throw new Error("--region must name a configured region");
  if (flags.exportDir !== undefined && !flags.dryRun)
    throw new Error("--export-dir reads a saved export, so it is for --dry-run only");
  if (flags.deployment === undefined && flags.exportDir === undefined)
    throw new Error("--deployment <name> is required (or --export-dir with --dry-run)");
  if (!flags.dryRun && !flags.steward) throw new Error("--steward <personId> is required");
  return flags;
}

const countBy = <T>(items: readonly T[], key: (item: T) => string) => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
};

export function summarise(plan: ChainPlan, publicPlaces: number) {
  const hide = plan.matches.filter((match) => match.decision === "hide");
  const spared = plan.matches.filter((match) => match.decision === "spare");
  const kept = plan.matches.filter((match) => match.decision === "protected");
  const sparedBy = (rule: SpareRule) => spared.filter((match) => match.spareRules?.includes(rule));
  const withSignal = (kind: SignalKind) =>
    hide.filter((match) => match.signals.some((signal) => signal.kind === kind));
  const only = (kind: SignalKind) =>
    hide.filter((match) => match.signals.every((signal) => signal.kind === kind));
  return {
    publicPlaces,
    toHide: hide.length,
    toHideByCategory: countBy(hide, (match) => match.category),
    bySignal: Object.fromEntries(
      SIGNAL_KINDS.map((kind) => [
        kind,
        {
          places: withSignal(kind).length,
          onlyThisSignal: only(kind).length,
          byCategory: countBy(withSignal(kind), (match) => match.category),
        },
      ]),
    ) as Record<
      SignalKind,
      { places: number; onlyThisSignal: number; byCategory: Record<string, number> }
    >,
    branchPatternFoundOnlyWithJapanWideCount: hide.filter((match) => match.japanWideOnly).length,
    sparedAsLocalMultiBranch: sparedBy("local_multi_branch").length,
    sparedAsNagasakiBorn: sparedBy("nagasaki_born").length,
    sparedAsFlagship: sparedBy("flagship").length,
    keptBecauseStoriesPostsOrOwner: kept.length,
    afterHiding: publicPlaces - hide.length,
  };
}

const cell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");

function markdown(report: ReturnType<typeof buildReport>): string {
  const lines: string[] = [];
  const s = report.summary;
  lines.push(
    "# Chains on the map: dry-run report",
    "",
    `Generated ${report.generatedAt} from ${report.source}.`,
    `Rules: Name Suggestion Index ${report.nsi.version} (BSD-3-Clause), Overture snapshot ${report.snapshot.release} (${report.snapshot.count} records).`,
    "",
    "## Counts",
    "",
    `- Public places read: ${s.publicPlaces}`,
    `- To hide: ${s.toHide} (map after hiding: ${s.afterHiding})`,
    `- Spared (a place can have more than one reason):`,
    `  - local multi-branch place (branch pattern only, fewer than 5, only in Nagasaki): ${s.sparedAsLocalMultiBranch}`,
    `  - Nagasaki-born (Nagasaki prefecture holds 30% or more of the name's places in Japan): ${s.sparedAsNagasakiBorn}`,
    `  - flagship (the name ends in 本店, 総本店 or 本家): ${s.sparedAsFlagship}`,
    `- Kept because they hold a story, a linked post or an owner: ${s.keptBecauseStoriesPostsOrOwner}`,
    "",
    "| Signal | Places | Only this signal |",
    "| --- | ---: | ---: |",
    ...SIGNAL_KINDS.map(
      (kind) =>
        `| ${SIGNAL_LABEL[kind]} | ${s.bySignal[kind].places} | ${s.bySignal[kind].onlyThisSignal} |`,
    ),
    "",
    "| Category | To hide |",
    "| --- | ---: |",
    ...Object.entries(s.toHideByCategory).map(([category, n]) => `| ${category} | ${n} |`),
    "",
  );
  if (report.evidence.missing > 0)
    lines.push(
      `> ${report.evidence.missing} of ${report.evidence.requested} base names the rules looked at have no Japan-wide count (${report.evidence.file}); they are judged on the Nagasaki snapshot alone. Run scripts/fetch-chain-evidence.py with .scratch/chains-evidence-request.json to add them.`,
      "",
    );
  lines.push(
    "## Matches per NSI brand",
    "",
    "| Brand | Tree | Places |",
    "| --- | --- | ---: |",
    ...report.perBrand.map((brand) => `| ${cell(brand.name)} | ${brand.path} | ${brand.places} |`),
    "",
    `## Places to hide (${report.hide.length})`,
    "",
    "| Name | Category | Reason |",
    "| --- | --- | --- |",
    ...report.hide.map(
      (match) =>
        `| ${cell(match.name)} | ${match.category} | ${cell(match.signals.map((signal) => signal.reason).join(" AND "))} |`,
    ),
    "",
    `## Spared (${report.spared.length})`,
    "",
    "| Name | Category | Rule | Why spared | What would have hidden it |",
    "| --- | --- | --- | --- | --- |",
    ...report.spared.map(
      (match) =>
        `| ${cell(match.name)} | ${match.category} | ${(match.spareRules ?? []).join(", ")} | ${cell(match.note ?? "")} | ${cell(match.signals.map((signal) => signal.reason).join("; "))} |`,
    ),
    "",
    `## Kept: story, linked post or owner (${report.kept.length})`,
    "",
    ...report.kept.map((match) => `- ${match.name} (${match.category}): ${match.note ?? ""}`),
    "",
  );
  return lines.join("\n");
}

function buildReport(args: {
  source: string;
  nsi: NsiStats;
  snapshot: { release: string; count: number };
  plan: ChainPlan;
  publicPlaces: number;
  evidenceFile: string;
}) {
  const { plan } = args;
  const pick = (decision: PlaceMatch["decision"]) =>
    plan.matches.filter((match) => match.decision === decision);
  return {
    generatedAt: new Date().toISOString(),
    source: args.source,
    nsi: args.nsi,
    snapshot: args.snapshot,
    summary: summarise(plan, args.publicPlaces),
    evidence: {
      file: args.evidenceFile,
      requested: plan.evidenceRequest.bases.length + plan.evidenceRequest.brands.length,
      missing: plan.missingEvidence,
    },
    perBrand: plan.perBrand,
    hide: pick("hide"),
    spared: pick("spare"),
    kept: pick("protected"),
  };
}

/** One matched place as the hide mutation receives it. */
const hideItem = (match: PlaceMatch) => ({
  placeId: match.placeId,
  signals: match.signals.map(({ kind, reason }) => ({ kind, reason })),
});

export async function runHideChains(
  argv: readonly string[],
  options: {
    cwd: string;
    run?: ConvexRunner;
    exec?: ExecLike;
    /** The Name Suggestion Index loader; tests give a fictional one. */
    nsi?: typeof loadNsi;
    log: (value: unknown) => void;
  },
) {
  if (argv.includes("--help")) {
    options.log(
      [
        "Usage: npx tsx scripts/hide-chains.ts --deployment <name> --dry-run",
        "       npx tsx scripts/hide-chains.ts --deployment <name> --steward <personId>",
        "       npx tsx scripts/hide-chains.ts --export-dir <dir> --dry-run",
        "Finds chain businesses among the public places and, without --dry-run, hides them as not for visitors.",
        "(a) a brand of the OSM Name Suggestion Index; (b) a base name shared by three or more places with a branch suffix (spared when it is fewer than five and only in Nagasaki); (c) the Overture brand field. Spared whatever the signal: a name Nagasaki prefecture holds 30% or more of in Japan, and a head shop (本店, 総本店, 本家).",
        "The deployment is read with `npx convex data` (read-only) into .scratch/chains-export/<name>; a dry run writes only .scratch/chains-report.json and .md.",
        "A place with a story, a linked post or a confirmed owner is never hidden. The run can be repeated: hidden places are no longer public, so nothing is hidden twice.",
        "Options: --snapshot <jsonl> (default " +
          DEFAULT_SNAPSHOT +
          "), --evidence <json> (default " +
          EVIDENCE_PATH +
          "), --out-dir <dir> (default .scratch), --region <id>.",
      ].join("\n"),
    );
    return;
  }
  const flags = parseFlags(argv);
  const outDir = resolve(options.cwd, flags.outDir);
  const exportDir =
    flags.exportDir !== undefined
      ? resolve(options.cwd, flags.exportDir)
      : join(outDir, "chains-export", flags.deployment!);
  if (flags.exportDir === undefined)
    await exportFromDeployment(flags.deployment!, exportDir, options.cwd, options.exec);

  const snapshot = await readChainSnapshot(resolve(options.cwd, flags.snapshot));
  const nsi = await (options.nsi ?? loadNsi)(outDir);
  const region = getRegionConfig(flags.region)!;
  const { brands, stats } = nsiBrands(nsi.data, nsi.features, region.defaultCenter);
  const { evidence } = await readEvidence(resolve(options.cwd, flags.evidence), snapshot.release);
  const places: PublicPlace[] = await readPublicPlaces(exportDir, flags.region);
  const plan = planChains({
    places,
    records: snapshot.records,
    brands,
    nsiVersion: nsi.version,
    evidence,
  });
  const report = buildReport({
    source:
      flags.exportDir !== undefined
        ? `export ${flags.exportDir}`
        : `deployment ${flags.deployment}`,
    nsi: stats,
    snapshot: { release: snapshot.release, count: snapshot.count },
    plan,
    publicPlaces: places.length,
    evidenceFile: flags.evidence,
  });
  await mkdir(dirname(join(outDir, "chains-report.json")), { recursive: true });
  await writeFile(join(outDir, "chains-report.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(outDir, "chains-report.md"), markdown(report));
  await writeFile(
    join(outDir, "chains-evidence-request.json"),
    JSON.stringify(
      {
        release: snapshot.release,
        genericSuffixes: [...GENERIC_SUFFIXES],
        bases: plan.evidenceRequest.bases,
        brands: plan.evidenceRequest.brands,
      },
      null,
      1,
    ) + "\n",
  );

  options.log(report.summary);
  for (const match of report.hide)
    options.log(
      `HIDE  ${match.name} | ${match.category} | ${match.signals.map((s) => s.reason).join(" AND ")}`,
    );
  for (const match of report.spared)
    options.log(
      `SPARE ${match.name} | ${match.category} | ${(match.spareRules ?? []).join(", ")} | ${match.note}`,
    );
  for (const match of report.kept)
    options.log(`KEPT  ${match.name} | ${match.category} | ${match.note}`);
  options.log(
    `Reports: ${join(flags.outDir, "chains-report.json")} and ${join(flags.outDir, "chains-report.md")}`,
  );

  if (flags.dryRun) {
    options.log("Dry run: nothing was written to the deployment.");
    return;
  }
  if (plan.missingEvidence > 0)
    options.log(
      `Note: ${plan.missingEvidence} base names have no Japan-wide count in ${flags.evidence}; they were judged on the Nagasaki snapshot alone.`,
    );
  const run =
    options.run ?? createCliRunner({ prod: false, deployment: flags.deployment, cwd: options.cwd });
  const items = report.hide.map(hideItem);
  const totals = { hidden: 0, alreadyHidden: 0, skipped: {} as Record<string, number> };
  const basis = `Name Suggestion Index ${nsi.version}; Overture ${snapshot.release}`;
  for (let i = 0; i < items.length; i += HIDE_BATCH) {
    const result = (await run("chains:hideChains", {
      regionId: flags.region,
      stewardPersonId: flags.steward,
      basis,
      places: items.slice(i, i + HIDE_BATCH),
    })) as {
      hidden: number;
      alreadyHidden: number;
      skipped: { placeId: string; reason: string }[];
    };
    totals.hidden += result.hidden;
    totals.alreadyHidden += result.alreadyHidden;
    for (const { reason } of result.skipped)
      totals.skipped[reason] = (totals.skipped[reason] ?? 0) + 1;
  }
  options.log(totals);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runHideChains(process.argv.slice(2), { cwd: process.cwd(), log: console.log }).catch(
    (error: unknown) => {
      console.error(
        error instanceof Error
          ? `Hiding chains failed: ${error.name}: ${error.message || "(no message)"}`
          : `Hiding chains failed: ${String(error)}`,
      );
      process.exitCode = 1;
    },
  );
