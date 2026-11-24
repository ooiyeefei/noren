import { detectScript as regionScript } from "../region/names";

export const CATEGORY_KEYS = ["amenity", "shop", "craft", "tourism", "historic"] as const;

export const ALLOWED_TAG_KEYS = [
  "name",
  "name:ja",
  "name:en",
  "name:ms",
  "name:zh",
  "name:ta",
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

export function pickTags(
  tags: unknown,
  nameLanguages: readonly string[] = ["ja", "en", "ms", "zh", "ta"],
): Record<string, string> {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) return {};
  const result: Record<string, string> = {};
  for (const key of ALLOWED_TAG_KEYS) {
    if (key.startsWith("name:")) {
      const language = key === "name:ja-Hrkt" ? "ja" : key.slice(5);
      if (!nameLanguages.includes(language)) continue;
    }
    const value = (tags as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) result[key] = value.trim().slice(0, 200);
  }
  return result;
}

export function detectScript(value: string) {
  return regionScript(value, {});
}

export function namesFromTags(
  tags: Record<string, string>,
  nameLanguages: readonly string[] = ["ja", "en"],
): {
  [lang: string]: string | undefined;
  ja?: string;
  en?: string;
  primary?: string;
} {
  const clean = pickTags(tags, nameLanguages);
  if (nameLanguages.some((lang) => lang !== "ja" && lang !== "en")) {
    const names: Record<string, string> = {};
    for (const lang of nameLanguages) {
      const value = clean[`name:${lang}`];
      if (value) names[lang] = value;
    }
    if (clean.name) {
      const script = regionScript(clean.name, { nameLanguages: [...nameLanguages] });
      const local = script === "hanzi" ? "zh" : script === "tamil" ? "ta" : nameLanguages[0];
      if (local && nameLanguages.includes(local)) names[local] ??= clean.name;
    }
    return { ...names, primary: clean.name ?? Object.values(names)[0] };
  }
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
