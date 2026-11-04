import { BranchIndex, isGenericBase, type BranchRecord } from "./branch";
import { keyLength } from "./names";
import { isLocalMultiBranch, JAPAN_NOTABLE, LOCAL_BRANCH_LIMIT, type Prefecture } from "./local";
import { BrandMatcher, type NsiBrand } from "./nsi";

/** Places a base name must be shared by before the branch pattern calls it a chain. */
export const BRANCH_MIN_SITES = 3;
/**
 * The Japan-wide count is read only for a base name of this many characters or more: a two-character
 * name (美山, 花蔵) is shared by unrelated places all over Japan and says nothing about a chain.
 */
export const JAPAN_MIN_BASE_LENGTH = 3;

/** One record of the Overture snapshot, as the chain rules read it. */
export type SnapshotRecord = BranchRecord & {
  brand: { name: string | null; wikidata: string | null } | null;
  prefecture: Prefecture;
};

/** A public place on the map, with the facts the rules need. */
export type PublicPlace = {
  id: string;
  category: string | undefined;
  /** Every name in any language, the primary one first. */
  names: string[];
  refs: { provider: string; ref: string }[];
  /** Why the place must never be hidden (stories, linked posts, an owner...); empty when nothing. */
  protectedBy: string[];
};

/** Places of a base name outside Nagasaki prefecture, found by the Japan-wide check of Overture. */
export type JapanEvidence = ReadonlyMap<string, { outside: number }>;

export type SignalKind = "brand_list" | "branch_pattern" | "overture_brand";

export type Signal = {
  kind: SignalKind;
  /** The citable reason, in one line. */
  reason: string;
  /** brand_list: the NSI item id; branch_pattern: the base name; overture_brand: the brand name. */
  detail: string;
};

export type Decision = "hide" | "spare" | "protected";

export type PlaceMatch = {
  placeId: string;
  name: string;
  category: string;
  signals: Signal[];
  decision: Decision;
  /** For a spared or protected place, why. */
  note?: string;
  /** The branch pattern found it only because of the Japan-wide count (fewer than three places in the snapshot). */
  japanWideOnly?: boolean;
};

export type ChainPlan = {
  matches: PlaceMatch[];
  /** Every base name the rules looked at, for the Japan-wide check of Overture. */
  evidenceRequest: { key: string; base: string }[];
  /** Requested base names with no Japan-wide count in the evidence. */
  missingEvidence: number;
  /** Number of public places matched by each brand, so over-matching brands stand out. */
  perBrand: { id: string; name: string; path: string; places: number }[];
};

export type PlanInputs = {
  places: readonly PublicPlace[];
  records: readonly SnapshotRecord[];
  brands: readonly NsiBrand[];
  nsiVersion: string;
  evidence?: JapanEvidence;
};

const primaryName = (place: PublicPlace) => place.names[0] ?? "(no name)";

type Reading = {
  key: string;
  base: string;
  /** Places in the snapshot that share the base (a place listed twice counts once). */
  sites: number;
  /** Of those, places whose address names another prefecture. */
  snapshotElsewhere: number;
  /** Places outside Nagasaki prefecture found by the Japan-wide check. */
  japan: number;
  withSuffix: number;
  examples: string[];
};

/**
 * The whole decision, with no I/O: which public places are chains by a brand of the Name Suggestion
 * Index, by a branch pattern shared by many places, or by the brand field of Overture; which of the
 * branch pattern's finds are spared as local multi-branch places; and which hold stories, posts or
 * an owner and are never hidden.
 */
export function planChains(inputs: PlanInputs): ChainPlan {
  const { places, records, brands, nsiVersion, evidence } = inputs;
  const matcher = new BrandMatcher(brands);
  const index = new BranchIndex(records);
  const byGers = new Map(records.map((record, position) => [record.id, position]));
  const matches: PlaceMatch[] = [];
  const requested = new Map<string, string>();
  const perBrand = new Map<string, { id: string; name: string; path: string; places: number }>();

  const reading = (
    key: string,
    base: string,
    ownSuffix: boolean,
  ): Reading & { hasSuffix: boolean } => {
    const group = index.group(key);
    const members = (group?.members ?? []).map((member) => index.records[member]!);
    const outside = evidence?.get(key)?.outside ?? 0;
    return {
      key,
      base,
      sites: members.length,
      snapshotElsewhere: members.filter((record) => record.prefecture === "other").length,
      japan: outside >= JAPAN_NOTABLE && keyLength(key) >= JAPAN_MIN_BASE_LENGTH ? outside : 0,
      withSuffix: (group?.members ?? []).filter(
        (member) => index.chosenBase(member).suffix !== null,
      ).length,
      examples: members.slice(0, 4).map((record) => record.name),
      hasSuffix: ownSuffix || (group?.hasSuffix ?? false),
    };
  };

  for (const place of places) {
    const category = place.category;
    if (category === undefined) continue;
    const signals: Signal[] = [];

    const brand = matcher.match(place.names, category);
    if (brand)
      signals.push({
        kind: "brand_list",
        detail: brand.brand.id,
        reason: `Name Suggestion Index ${nsiVersion}: the name starts with the brand "${brand.brand.displayName}" (${brand.brand.path}, ${brand.brand.coverage})`,
      });

    for (const ref of place.refs) {
      if (ref.provider !== "overture") continue;
      const record = records[byGers.get(ref.ref) ?? -1];
      if (!record?.brand) continue;
      const label = record.brand.name ?? record.brand.wikidata ?? "(unnamed brand)";
      signals.push({
        kind: "overture_brand",
        detail: label,
        reason: `Overture brand field: ${label}${record.brand.wikidata ? ` (${record.brand.wikidata})` : ""}`,
      });
      break;
    }

    // The branch pattern: a base name shared by three or more places, one of them with a suffix.
    // The places counted are those of the snapshot and, when the evidence has them, those the
    // Japan-wide check found outside Nagasaki prefecture.
    const readings: (Reading & { hasSuffix: boolean })[] = [];
    for (const name of place.names) {
      for (const candidate of index.candidates(name)) {
        if (isGenericBase(candidate.key)) continue;
        requested.set(candidate.key, candidate.base);
        readings.push(reading(candidate.key, candidate.base, true));
      }
      const chosen = index.baseOf(name);
      if (chosen.suffix === null && index.group(chosen.key)?.hasSuffix) {
        requested.set(chosen.key, chosen.base);
        readings.push(reading(chosen.key, chosen.base, false));
      }
    }
    const qualifying = readings
      .filter(
        (item) =>
          item.hasSuffix && !isGenericBase(item.key) && item.sites + item.japan >= BRANCH_MIN_SITES,
      )
      .sort((a, b) => b.sites + b.japan - (a.sites + a.japan) || b.key.length - a.key.length);
    const found = qualifying[0];
    let local: { signal: Signal; note: string } | null = null;
    if (found) {
      const elsewhere = found.snapshotElsewhere + found.japan;
      const inNagasaki =
        found.sites > 0
          ? `shared by ${found.sites} places in the Overture snapshot of Nagasaki (${found.withSuffix} with a branch suffix, such as ${found.examples.join(", ")})`
          : "not shared by another place in the Overture snapshot of Nagasaki";
      const outside =
        found.japan > 0
          ? `, and found with a branch suffix at ${found.japan} places outside Nagasaki prefecture`
          : "";
      const signal: Signal = {
        kind: "branch_pattern",
        detail: found.base,
        reason: `branch pattern: the base name "${found.base}" is ${inNagasaki}${outside}`,
      };
      if (isLocalMultiBranch({ sites: found.sites, elsewhere }))
        local = {
          signal,
          note: `${found.sites} places share the base name "${found.base}", none known outside Nagasaki prefecture, fewer than ${LOCAL_BRANCH_LIMIT}`,
        };
      else signals.push(signal);
    }

    // A local multi-branch place is spared only when the branch pattern is the only reason to hide it.
    if (signals.length === 0 && local) {
      matches.push({
        placeId: place.id,
        name: primaryName(place),
        category,
        signals: [local.signal],
        decision: "spare",
        note: local.note,
      });
      continue;
    }
    if (signals.length === 0) continue;
    const protectedPlace = place.protectedBy.length > 0;
    matches.push({
      placeId: place.id,
      name: primaryName(place),
      category,
      signals,
      decision: protectedPlace ? "protected" : "hide",
      ...(protectedPlace ? { note: `kept: ${place.protectedBy.join(", ")}` } : {}),
      ...(signals.every((signal) => signal.kind === "branch_pattern") &&
      found &&
      found.sites < BRANCH_MIN_SITES
        ? { japanWideOnly: true }
        : {}),
    });
    if (brand && !protectedPlace) {
      const entry = perBrand.get(brand.brand.id) ?? {
        id: brand.brand.id,
        name: brand.brand.displayName,
        path: brand.brand.path,
        places: 0,
      };
      entry.places++;
      perBrand.set(brand.brand.id, entry);
    }
  }

  const evidenceRequest = [...requested]
    .map(([key, base]) => ({ key, base }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return {
    matches,
    evidenceRequest,
    missingEvidence: evidence
      ? evidenceRequest.filter((item) => !evidence.has(item.key)).length
      : evidenceRequest.length,
    perBrand: [...perBrand.values()].sort(
      (a, b) => b.places - a.places || a.id.localeCompare(b.id),
    ),
  };
}
