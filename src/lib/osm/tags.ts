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
