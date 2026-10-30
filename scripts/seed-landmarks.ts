import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { geoUserAgent } from "../src/lib/geo";
import { getRegionConfig } from "../src/lib/region/registry";
import { createCliRunner, parseSeedFlags } from "./lib/convex-run";
import { fetchLeads, leadUrl } from "./lib/wikipedia";

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(
      "Usage: npx tsx scripts/seed-landmarks.ts [--data scripts/data/landmarks.json] [--prod] [--dry-run]\nOwner confirms the landmark list. Requires GEO_USER_AGENT in App/version (+https://public-project-url) form. Imports unlinked Wikipedia leads; no places or pins are created.",
    );
    return;
  }
  const flags = parseSeedFlags(argv);
  const data = z
    .strictObject({
      regionId: z.string().min(1),
      landmarks: z
        .array(
          z.strictObject({
            key: z.string().min(1),
            wikipedia: z.strictObject({ ja: z.string().min(1), en: z.string().min(1) }),
          }),
        )
        .min(1),
    })
    .parse(JSON.parse(await readFile(flags.data || "scripts/data/landmarks.json", "utf8")));
  if (!getRegionConfig(data.regionId)) throw new Error("Unknown region");
  const items = data.landmarks.flatMap((l) =>
    Object.entries(l.wikipedia).map(([lang, title]) => ({ lang, title })),
  );
  if (flags.dryRun) {
    for (const item of items) console.log({ fetch: leadUrl(item.lang, item.title).href });
    console.log({
      fn: "openText:importSnippets",
      batchSize: 10,
      target: flags.prod ? "production" : "development",
    });
    return;
  }
  const userAgent = geoUserAgent(process.env);
  if (!userAgent) throw new Error("A valid GEO_USER_AGENT is required");
  const snippets = await fetchLeads(items, {
    fetch,
    userAgent,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  });
  const run = createCliRunner({ prod: flags.prod, cwd: process.cwd() });
  for (let i = 0; i < snippets.length; i += 10)
    console.log(await run("openText:importSnippets", { snippets: snippets.slice(i, i + 10) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
