import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { ROLES, type Role } from "../src/lib/domain/constants";
import { getRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, parseSeedFlags, type ConvexRunner } from "./lib/convex-run";
import { demoSteps, parseDemoData, resolveArgs, type DemoData } from "./lib/demo-plan";

export async function runDemo(
  data: DemoData,
  options: { issuer?: string; dryRun: boolean; prod: boolean; markAccounts?: boolean },
  runner: ConvexRunner,
  print: (value: unknown) => void = console.log,
) {
  const region = getRegionConfig(data.regionId);
  if (!region) throw new Error("Unknown region");
  const steps = options.markAccounts
    ? ROLES.map((role) => ({
        label: `Mark ${role}`,
        fn: "seed:markMockPerson",
        args: { clerkUserId: data.accounts[role], role, regionId: data.regionId },
        as: "admin" as const,
        saveAs: undefined,
      }))
    : demoSteps(data, region);
  if (!options.dryRun && !options.markAccounts && !options.issuer)
    throw new Error("--issuer is required: pass the iss claim of a real Clerk token exactly");
  const saved: Record<string, unknown> = {};
  for (const [index, step] of steps.entries()) {
    const currentRole = step.fn === "people:current" ? ROLES[index - ROLES.length] : undefined;
    const role = currentRole ?? (step.as === "admin" ? undefined : step.as);
    if (options.dryRun) {
      print({
        ...step,
        as: role ?? "admin",
        target: options.prod ? "production" : "development",
        issuerRequired: role !== undefined,
      });
      continue;
    }
    const result = await runner(
      step.fn,
      resolveArgs(step.args, saved),
      role ? { identity: { subject: data.accounts[role], issuer: options.issuer! } } : undefined,
    );
    if (step.fn === "seed:personIdFor") {
      const expected = ROLES[index]!;
      const person = result as { personId?: string; role?: Role; isMock?: boolean } | null;
      if (!person?.personId || person.role !== expected || person.isMock !== true) {
        const args = JSON.stringify({
          clerkUserId: data.accounts[expected],
          role: expected,
          regionId: data.regionId,
        });
        throw new Error(
          `Mock ${expected} preflight failed. Sign in once, then run: npx convex run seed:markMockPerson '${args}'${options.prod ? " --prod" : ""}`,
        );
      }
      saved[step.saveAs!] = person.personId;
    } else if (step.fn === "people:current") {
      const person = result as { role?: string; isMock?: boolean } | null;
      if (!person || person.role !== currentRole || person.isMock !== true)
        throw new Error(
          "issuer mismatch: pass the iss claim of a real Clerk token exactly, no trailing slash",
        );
    } else if (step.fn === "places:listMine") {
      if (!Array.isArray(result)) throw new Error("Invalid places:listMine response");
      if (result.length >= 200)
        throw new Error(
          "places:listMine reached its 200-place limit; cannot safely check duplicates",
        );
      const primaryNames = data.place.names.filter((n) => n.isPrimary);
      if (primaryNames.length === 0) throw new Error("Provide a primary name");
      if (
        result.some((place: { names: { value: string; isPrimary: boolean }[] }) =>
          place.names.some((n) => n.isPrimary && primaryNames.some((p) => p.value === n.value)),
        )
      )
        throw new Error("A place with the same primary name already exists; refusing to reseed");
    } else if (step.saveAs) {
      saved[step.saveAs] =
        step.fn === "places:create"
          ? (result as { placeId: string }).placeId
          : step.fn === "sources:add"
            ? (result as { sourceId: string }).sourceId
            : result;
      if (!saved[step.saveAs]) throw new Error(`Missing id from ${step.fn}`);
    }
    print(step.label);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(
      "Usage: npx tsx scripts/seed-demo.ts [mark-accounts] [--data scripts/data/demo.json] [--issuer <exact Clerk iss https URL>] [--prod] [--dry-run]\nCreate four Clerk mock accounts and sign in once first. mark-accounts is an admin command. Dry runs print steps and run nothing.",
    );
    return;
  }
  const markAccounts = argv[0] === "mark-accounts";
  const flags = parseSeedFlags(markAccounts ? argv.slice(1) : argv);
  const data = parseDemoData(
    JSON.parse(await readFile(flags.data || "scripts/data/demo.json", "utf8")),
  );
  await runDemo(
    data,
    { ...flags, markAccounts },
    createCliRunner({ prod: flags.prod, cwd: process.cwd() }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
