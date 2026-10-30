import { errorText } from "@/components/layout/error-text";
import type { Script } from "@/lib/domain/constants";
import { messagesFor, type Locale } from "@/lib/i18n";
import { candidateMessages } from "@/lib/i18n/messages/candidates";
import { getRegionConfig } from "@/lib/region/registry";
import type { RegionConfig } from "@/lib/region/schema";

export type Candidate = {
  _id: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  names: { ja?: string; en?: string; primary?: string };
  category: string;
  lat: number;
  lng: number;
  attribution: string;
  isChain?: boolean;
};
export type NameInput = { lang: Locale; value: string; isPrimary: boolean };
export type CandidateDraft = {
  names: NameInput[];
  lat: string;
  lng: string;
  category: string;
};
type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export function listArgs({
  regionId,
  category,
  focusOnly,
  localOnly,
  paginationOpts,
}: {
  regionId: string;
  category: string;
  focusOnly: boolean;
  localOnly: boolean;
  paginationOpts: { numItems: number; cursor: string | null };
}) {
  return {
    regionId,
    category: category || undefined,
    focusOnly,
    includeChains: !localOnly,
    paginationOpts,
  };
}

export function showChainBadge(candidate: Pick<Candidate, "isChain">, localOnly: boolean) {
  return !localOnly && candidate.isChain === true;
}

export function detectScript(value: string): Script {
  // A mixed Japanese name follows its most specific script, even with Latin brand text.
  if (/\p{Script=Han}/u.test(value)) return "kanji";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) return "kana";
  return "latin";
}

export function buildNameSet(
  inputs: readonly NameInput[],
  locale: Locale,
): Result<(NameInput & { script: Script })[]> {
  const reason = messagesFor(candidateMessages, locale).invalidNames;
  if (!inputs.length || inputs.length > 12 || !inputs.some((name) => name.isPrimary))
    return { ok: false, reason };
  const primaries = new Set<string>();
  const seen = new Set<string>();
  const names: (NameInput & { script: Script })[] = [];
  for (const input of inputs) {
    const value = input.value.trim();
    const script = detectScript(value);
    const key = JSON.stringify([input.lang, script, value]);
    if (
      !value ||
      value.length > 120 ||
      !["ja", "en"].includes(input.lang) ||
      seen.has(key) ||
      (input.isPrimary && primaries.has(input.lang))
    )
      return { ok: false, reason };
    seen.add(key);
    if (input.isPrimary) primaries.add(input.lang);
    names.push({ ...input, value, script });
  }
  return { ok: true, value: names };
}

export function candidateDraft(candidate: Candidate): CandidateDraft {
  const names: NameInput[] = [];
  for (const lang of ["ja", "en"] as const) {
    const value = candidate.names[lang];
    if (value) names.push({ lang, value, isPrimary: true });
  }
  const primary = candidate.names.primary;
  if (primary && !names.some((name) => name.value === primary)) {
    const lang = detectScript(primary) === "latin" ? "en" : "ja";
    names.push({ lang, value: primary, isPrimary: !names.some((name) => name.lang === lang) });
  }
  if (!names.length) names.push({ lang: "ja", value: "", isPrimary: true });
  return {
    names,
    lat: String(candidate.lat),
    lng: String(candidate.lng),
    category: candidate.category,
  };
}

export function validatePin(
  regionId: string,
  input: { lat: string; lng: string },
  locale: Locale,
): Result<{ lat: number; lng: number }> {
  const region = getRegionConfig(regionId);
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (
    region &&
    input.lat.trim() &&
    input.lng.trim() &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    const [west, south, east, north] = region.bbox;
    if (lat >= south && lat <= north && lng >= west && lng <= east)
      return { ok: true, value: { lat, lng } };
  }
  return { ok: false, reason: messagesFor(candidateMessages, locale).invalidPin };
}

export function categoryOptions(region: Pick<RegionConfig, "categories">, locale: Locale) {
  return [...(region.categories ?? [])]
    .sort((a, b) => Number(b.focus) - Number(a.focus))
    .map((category) => ({
      key: category.key,
      label: category.labels[locale] ?? category.key,
      focus: category.focus,
    }));
}

export function nextPage(result: {
  page: readonly unknown[];
  isDone: boolean;
  continueCursor: string;
}): string | null {
  return result.isDone ? null : result.continueCursor;
}

export function candidateError(error: unknown, locale: Locale): string {
  return errorText(error, locale);
}
