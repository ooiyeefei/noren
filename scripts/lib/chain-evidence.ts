import { readFile } from "node:fs/promises";
import type { BaseEvidence, BrandEvidence, JapanEvidence } from "../../src/lib/chains/plan";

export const EVIDENCE_PATH = "scripts/data/chain-evidence-japan.json";

export type EvidenceFile = {
  release: string;
  retrievedAt: string;
  source: string;
  bases: Record<
    string,
    {
      base: string;
      outside: number;
      outsideNamesakes?: number;
      nagasakiOutsideBox?: number;
      nagasakiNamesakes?: number;
      examples: string[];
    }
  >;
  brands?: Record<
    string,
    { name: string; elsewhere: number; nagasakiOutsideBox: number; examples: string[] }
  >;
};

const whole = (path: string, label: string, value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error(`${path}: the count for "${label}" is not a whole number`);
  return value;
};

/**
 * What the Japan-wide check of Overture (scripts/fetch-chain-evidence.py) found for the base names and
 * brands the chain rules looked at: how many places outside Nagasaki prefecture share each, and how
 * many in the prefecture but outside the snapshot's box. A missing file reads as no evidence: the rules
 * then judge on the Nagasaki snapshot alone, as the owner's rule says, the Nagasaki-born rule cannot
 * apply, and the report says so.
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
  const bases = new Map<string, BaseEvidence>();
  for (const [key, entry] of Object.entries(file.bases)) {
    bases.set(key, {
      outside: whole(path, key, entry.outside),
      ...(entry.nagasakiOutsideBox !== undefined
        ? { nagasaki: whole(path, key, entry.nagasakiOutsideBox) }
        : {}),
    });
  }
  const brands = new Map<string, BrandEvidence>();
  for (const [id, entry] of Object.entries(file.brands ?? {}))
    brands.set(id, {
      elsewhere: whole(path, id, entry.elsewhere),
      nagasaki: whole(path, id, entry.nagasakiOutsideBox),
    });
  return { evidence: { bases, brands }, file };
}
