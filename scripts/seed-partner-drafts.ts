import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, parseSeedFlags } from "./lib/convex-run";
import { parsePartnerData, partnerSteps } from "./lib/partner-plan";

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(
      "Usage: npx tsx scripts/seed-partner-drafts.ts --steward <Clerk user id> --issuer <exact Clerk iss https URL> [--data scripts/data/partner-businesses.json] [--prod] [--dry-run]\nCreates business drafts with public names and pins only. publicSource is input provenance, not stored; category and address are not stored. Existing names are skipped after places:listAll.",
    );
    return;
  }
  const rest: string[] = [];
  let steward: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--steward") {
      steward = argv[++i];
      if (!steward || steward.startsWith("--")) throw new Error("Missing --steward value");
    } else rest.push(argv[i]!);
  }
  const flags = parseSeedFlags(rest);
  const data = parsePartnerData(
    JSON.parse(await readFile(flags.data || "scripts/data/partner-businesses.json", "utf8")),
  );
  if (!getRegionConfig(data.regionId)) throw new Error("Unknown region");
  if (flags.dryRun) {
    console.log({
      fn: "people:current",
      as: "steward",
      target: flags.prod ? "production" : "development",
    });
    console.log({
      fn: "places:listAll",
      args: { regionId: data.regionId },
      as: "steward",
      note: "Existing names will be skipped at execution",
    });
    for (const step of partnerSteps(data, []))
      console.log({ ...step, "not stored": step.notStored });
    return;
  }
  if (!steward || !flags.issuer) throw new Error("--steward and --issuer are required");
  const run = createCliRunner({ prod: flags.prod, cwd: process.cwd() });
  const options = { identity: { subject: steward, issuer: flags.issuer } };
  const person = (await run("people:current", {}, options)) as {
    role?: string;
    isMock?: boolean;
  } | null;
  if (person?.role !== "steward" || person.isMock !== false)
    throw new Error(
      "Use a signed-in real steward with the exact Clerk issuer; partner drafts must not be marked mock",
    );
  const existing = await run("places:listAll", { regionId: data.regionId }, options);
  if (!Array.isArray(existing) || existing.length >= 200)
    throw new Error(
      "Cannot safely check existing names: listAll invalid or at its 200-place limit",
    );
  for (const step of partnerSteps(data, existing)) {
    console.log({
      label: step.label,
      publicSource: step.publicSource,
      "not stored": step.notStored,
    });
    console.log(await run(step.fn, step.args, options));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
