import { readFile } from "node:fs/promises";
import type { JapanEvidence } from "../../src/lib/chains/plan";

export const EVIDENCE_PATH = "scripts/data/chain-evidence-japan.json";

export type EvidenceFile = {
  release: string;
  retrievedAt: string;
  source: string;
  bases: Record<
    string,
    { base: string; outside: number; outsideNamesakes?: number; examples: string[] }
  >;
};

/**
 * What the Japan-wide check of Overture (scripts/fetch-chain-evidence.py) found for the base names the
 * chain rules looked at: how many places outside Nagasaki prefecture share each. A missing file reads
 * as no evidence: the rules then judge on the Nagasaki snapshot alone, as the owner's rule says, and
 * the report says so.
 */
export async function readEvidence(
  path: string,
  release: string,
): Promise<{ evidence: JapanEvidence | undefined; file?: EvidenceFile }> {
  let file: EvidenceFile;
  try {
    file = JSON.parse(await readFile(path, "utf8")) as EvidenceFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { evidence: undefined };
    throw error;
  }
  if (file.release !== release)
    throw new Error(`${path} is for Overture release ${file.release}, not ${release}`);
  const evidence = new Map<string, { outside: number }>();
  for (const [key, entry] of Object.entries(file.bases)) {
    if (!Number.isInteger(entry.outside) || entry.outside < 0)
      throw new Error(`${path}: the count for "${key}" is not a whole number`);
    evidence.set(key, { outside: entry.outside });
  }
  return { evidence, file };
}
