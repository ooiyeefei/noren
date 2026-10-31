import type { Script } from "../domain/constants";

export const CATEGORY_KEYS = ["amenity", "shop", "craft", "tourism", "historic"] as const;

export const ALLOWED_TAG_KEYS = [
  "name",
  "name:ja",
  "name:en",
  "name:ja-Hrkt",
  "amenity",
  "shop",
  "craft",
  "tourism",
  "historic",
  "cuisine",
] as const;

export function isChainFromTags(tags: unknown): boolean {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return false;
  return ["brand", "brand:wikidata"].some((key) => {
    const value = (tags as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

const CHAIN_NAME_KEYS = ["name", "name:ja", "name:en"] as const;
const comparable = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

/** The names a chain goes by, read from one branded listing: each name without a trailing branch
 * name, so "ほっともっと 文教町店" gives "ほっともっと". */
export function chainNames(tags: Record<string, string>): string[] {
  const names = new Set<string>();
  for (const key of CHAIN_NAME_KEYS) {
    const value = tags[key] ? comparable(tags[key]) : "";
    const name = /^(.+?) \S*店$/u.exec(value)?.[1] ?? value;
    if ([...name].length >= 2) names.add(name);
  }
  return [...names];
}

/**
 * The chain a listing is named as a branch of, when OSM tags the brand on only some branches: the
 * chain's name alone, then a space and a branch ("ほっともっと 久留里店"), or straight away a branch
 * name ending in 店 ("リンガーハット長崎稲佐橋店"). "ジョイフルサン 木鉢店" is another chain, not
 * a branch of "ジョイフル".
 */
export function branchOf(
  tags: Record<string, string>,
  chains: Iterable<string>,
): string | undefined {
  const names = CHAIN_NAME_KEYS.flatMap((key) => (tags[key] ? [comparable(tags[key])] : []));
  for (const chain of chains)
    for (const name of names) {
      if (!name.startsWith(chain)) continue;
      const rest = name.slice(chain.length);
      if (rest === "" || rest.startsWith(" ") || (rest.endsWith("店") && !rest.includes(" ")))
        return chain;
    }
  return undefined;
}

export function pickTags(tags: unknown): Record<string, string> {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return {};
  const result: Record<string, string> = {};
  for (const key of ALLOWED_TAG_KEYS) {
    const value = (tags as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) result[key] = value.trim().slice(0, 200);
  }
  return result;
}

export function detectScript(value: string): Script {
  // A mixed Japanese name follows its most specific script, even with Latin brand text.
  if (/\p{Script=Han}/u.test(value)) return "kanji";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) return "kana";
  return "latin";
}

export function namesFromTags(tags: Record<string, string>): {
  ja?: string;
  en?: string;
  primary?: string;
} {
  const clean = pickTags(tags);
  const primary = clean.name ?? clean["name:ja"] ?? clean["name:en"] ?? clean["name:ja-Hrkt"];
  const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  const ja = clean["name:ja"] ?? (clean.name && japanese.test(clean.name) ? clean.name : undefined);
  const en =
    clean["name:en"] ??
    (clean.name && !japanese.test(clean.name) && /\p{Script=Latin}/u.test(clean.name)
      ? clean.name
      : undefined);
  return { ...(ja ? { ja } : {}), ...(en ? { en } : {}), ...(primary ? { primary } : {}) };
}
