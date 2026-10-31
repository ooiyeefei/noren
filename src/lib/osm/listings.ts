import type { Script } from "../domain/constants";
import { categoryForTags, isForVisitors } from "./categories";
import { branchOf, chainNames, detectScript, namesFromTags } from "./tags";

export type ListingCandidate = {
  _id: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  tags: Record<string, string>;
  lat: number;
  lng: number;
  category?: string;
  isChain?: boolean;
  confirmedPlaceId?: string;
  dismissedAt?: number;
};

export function listingNames(tags: Record<string, string>, locales: readonly string[]) {
  const names: { lang: string; script: Script; value: string; isPrimary: boolean }[] = [];
  const { ja, en } = namesFromTags(tags);
  // A Latin-only `name` (e.g. a shop signed "TSUTAYA") is what people call it here, not a translation.
  const local = ja ?? tags.name?.trim();
  for (const [lang, raw] of [
    ["ja", local],
    ["en", en],
  ] as const) {
    // OSM separates several values with ";" (e.g. a hot spring and its bath); keep every part.
    const value = raw
      ?.split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
    if (value && locales.includes(lang))
      names.push({ lang, script: detectScript(value), value, isPrimary: true });
  }
  return names;
}

/** Untagged listings named as branches of a chain that another listing carries a brand tag for. */
export function chainBranches<T extends ListingCandidate>(
  candidates: readonly T[],
): { branch: T; chain: T }[] {
  const chains = new Map<string, T>();
  for (const candidate of candidates)
    if (candidate.isChain)
      for (const name of chainNames(candidate.tags))
        if (!chains.has(name)) chains.set(name, candidate);
  const pairs: { branch: T; chain: T }[] = [];
  for (const candidate of candidates) {
    const name = candidate.isChain ? undefined : branchOf(candidate.tags, chains.keys());
    if (name !== undefined) pairs.push({ branch: candidate, chain: chains.get(name)! });
  }
  return pairs;
}

function normalizedName(candidate: ListingCandidate): string {
  return (candidate.tags.name ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function distanceMetres(a: ListingCandidate, b: ListingCandidate): number {
  const radians = Math.PI / 180;
  const lat = Math.sin(((b.lat - a.lat) * radians) / 2) ** 2;
  const lng = Math.sin(((b.lng - a.lng) * radians) / 2) ** 2;
  const h = lat + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * lng;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function nameCount(candidate: ListingCandidate): number {
  return Object.entries(candidate.tags).filter(
    ([key, value]) => (key === "name" || key.startsWith("name:")) && value.trim(),
  ).length;
}

export function selectListings<T extends ListingCandidate>(
  candidates: readonly T[],
  { focusCategories }: { focusCategories: readonly string[] },
): {
  publish: T[];
  duplicates: { keep: T["_id"]; drop: T["_id"] }[];
  skipped: { id: T["_id"]; reason: string }[];
} {
  const skipped: { id: T["_id"]; reason: string }[] = [];
  const eligible = candidates.filter((candidate) => {
    const reason = candidate.confirmedPlaceId
      ? "already confirmed"
      : candidate.dismissedAt !== undefined
        ? "already dismissed"
        : !candidate.tags.name?.trim()
          ? "missing name tag"
          : !focusCategories.includes(candidate.category ?? categoryForTags(candidate.tags))
            ? "non-focus category"
            : !isForVisitors(candidate.tags, candidate.isChain === true)
              ? "not for visitors"
              : null;
    if (reason) skipped.push({ id: candidate._id, reason });
    return reason === null;
  });
  const rank = { node: 0, way: 1, relation: 2 };
  eligible.sort(
    (a, b) =>
      nameCount(b) - nameCount(a) ||
      rank[a.osmType] - rank[b.osmType] ||
      a.osmId - b.osmId ||
      a._id.localeCompare(b._id),
  );
  const groups = new Map<string, T[]>();
  const publish: T[] = [];
  const duplicates: { keep: T["_id"]; drop: T["_id"] }[] = [];
  // Compare against retained winners so each reported duplicate is within 80 m of its keeper.
  for (const candidate of eligible) {
    const name = normalizedName(candidate);
    const winners = groups.get(name) ?? [];
    const keep = winners.find((winner) => distanceMetres(winner, candidate) <= 80);
    if (keep) duplicates.push({ keep: keep._id, drop: candidate._id });
    else {
      winners.push(candidate);
      groups.set(name, winners);
      publish.push(candidate);
    }
  }
  return { publish, duplicates, skipped };
}
