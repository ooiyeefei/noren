import type { RegionConfig } from "../region/schema";

// Hard rules ("avoid") and interests. A hard rule removes places from the draw. An interest only
// tilts the odds (see weights.ts). Neither is ever shown as a score.
//
// A hard rule is applied only when Noren can check it from data it really holds: a place's
// category, or the cautions its owner confirmed (the fixed list in the region file). Anything else
// is handed back as "not checked", so the assistant can say so plainly instead of pretending.

type RegionVocabulary = Pick<RegionConfig, "cautionVocabulary" | "categories">;

/** "Cash free", "cash_free" and " CASH-FREE " are the same tag. */
export function normaliseTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

export type AvoidRule = {
  /** The tags that mean this rule, already normalised. */
  tags: readonly string[];
  /** What Noren checks, in plain words, for the traveller. */
  checks: string;
  /** What Noren cannot see, so the traveller does not read too much into the rule. */
  limit: string;
} & ({ caution: string; category?: never } | { category: string; caution?: never });

export const AVOID_RULES: readonly AvoidRule[] = [
  {
    tags: ["cash-free", "cashless", "no-cash", "card-only"],
    caution: "cash_only",
    checks: "leaves out places whose owner says they take cash only",
    limit: "Noren cannot tell whether the other places take cards",
  },
  {
    tags: ["step-free", "no-steps", "no-stairs", "wheelchair", "wheelchair-friendly", "accessible"],
    caution: "accessibility_steps",
    checks: "leaves out places that list steps or accessibility notes",
    limit: "Noren cannot confirm that any place is step-free",
  },
  {
    tags: ["no-reservation", "walk-in", "walk-ins", "no-booking"],
    caution: "reservation_required",
    checks: "leaves out places whose owner says a reservation is required",
    limit: "Noren cannot tell whether the other places are easy to walk into",
  },
  {
    tags: ["photo-friendly", "photos-ok", "photography-ok"],
    caution: "no_photography",
    checks: "leaves out places whose owner asks for no photography",
    limit: "Noren cannot tell whether the other places welcome photos",
  },
  {
    tags: ["no-alcohol", "alcohol-free", "dry", "sober"],
    category: "bar",
    checks: "leaves out bars and izakaya",
    limit: "Noren cannot tell whether a restaurant or café serves alcohol",
  },
];

/** Tags about food and health that Noren has no data for. Named so the reason can be exact. */
const NO_MENU_DATA = new Set([
  "vegetarian",
  "vegan",
  "halal",
  "kosher",
  "gluten-free",
  "allergy-friendly",
  "nut-free",
  "pork-free",
  "seafood-free",
  "no-raw-fish",
  "dairy-free",
]);

export type AvoidResolution = {
  /** Rules that will filter, each with what it checks and what it cannot see. */
  applied: { tag: string; checks: string; limit: string; basis: "caution" | "category" }[];
  /** Tags Noren could not check, with the reason. These filter nothing. */
  notChecked: { tag: string; reason: string }[];
  excludedCategories: ReadonlySet<string>;
  excludedCautions: ReadonlySet<string>;
};

/** Turns the traveller's "avoid" tags into rules, keeping only those Noren can really check. */
export function resolveAvoid(tags: readonly string[], region: RegionVocabulary): AvoidResolution {
  const applied: AvoidResolution["applied"] = [];
  const notChecked: AvoidResolution["notChecked"] = [];
  const excludedCategories = new Set<string>();
  const excludedCautions = new Set<string>();
  const seen = new Set<string>();
  const hasCaution = (key: string) => region.cautionVocabulary.some((c) => c.key === key);
  const hasCategory = (key: string) => region.categories?.some((c) => c.key === key) ?? false;

  for (const raw of tags) {
    const tag = normaliseTag(raw);
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    const rule = AVOID_RULES.find((candidate) => candidate.tags.includes(tag));
    if (rule === undefined) {
      notChecked.push({
        tag: raw.trim(),
        reason: NO_MENU_DATA.has(tag)
          ? "Noren has no menu or ingredient data, so it cannot check this. Ask the place."
          : "Noren has no data it can check this against.",
      });
    } else if (rule.caution !== undefined && !hasCaution(rule.caution)) {
      notChecked.push({ tag: raw.trim(), reason: "This region does not record that." });
    } else if (rule.category !== undefined && !hasCategory(rule.category)) {
      notChecked.push({ tag: raw.trim(), reason: "This region does not record that." });
    } else {
      if (rule.caution !== undefined) excludedCautions.add(rule.caution);
      if (rule.category !== undefined) excludedCategories.add(rule.category);
      applied.push({
        tag: raw.trim(),
        checks: rule.checks,
        limit: rule.limit,
        basis: rule.caution !== undefined ? "caution" : "category",
      });
    }
  }
  return { applied, notChecked, excludedCategories, excludedCautions };
}

/**
 * Moves the rules that rest on owners' confirmed cautions to "not checked". Used while a region
 * does not yet show owners' statements to the public: a rule must not filter on something the
 * traveller cannot see on the page.
 */
export function withoutCautionRules(rules: AvoidResolution, reason: string): AvoidResolution {
  return {
    applied: rules.applied.filter((rule) => rule.basis !== "caution"),
    notChecked: [
      ...rules.notChecked,
      ...rules.applied
        .filter((rule) => rule.basis === "caution")
        .map(({ tag }) => ({ tag, reason })),
    ],
    excludedCategories: rules.excludedCategories,
    excludedCautions: new Set(),
  };
}

/** Whether a place stays in the draw. `cautions` are the caution keys its owner confirmed. */
export function passesAvoid(
  rules: Pick<AvoidResolution, "excludedCategories" | "excludedCautions">,
  place: { category?: string; cautions: readonly string[] },
): boolean {
  if (place.category !== undefined && rules.excludedCategories.has(place.category)) return false;
  return !place.cautions.some((key) => rules.excludedCautions.has(key));
}

/** Whether the filter needs each place's cautions, which cost a lookup per place. */
export function needsCautions(rules: Pick<AvoidResolution, "excludedCautions">): boolean {
  return rules.excludedCautions.size > 0;
}

type InterestRule = { tags: readonly string[]; categories: readonly string[] };

// Which categories each interest tilts toward. These are a first guess, easy to change. An
// interest looks only at a place's category, never at what people wrote about it.
const INTEREST_RULES: readonly InterestRule[] = [
  {
    tags: ["history", "historic", "heritage", "culture", "architecture"],
    categories: ["museum", "attraction"],
  },
  {
    tags: ["food", "eating", "local-food", "restaurants", "lunch", "dinner"],
    categories: ["restaurant", "cafe"],
  },
  { tags: ["coffee", "cafe", "cafes", "tea", "sweets"], categories: ["cafe"] },
  { tags: ["drinks", "bars", "izakaya", "nightlife", "beer", "sake"], categories: ["bar"] },
  {
    tags: ["craft", "crafts", "handmade", "shopping", "shops", "souvenirs"],
    categories: ["shop", "gallery", "music_shop"],
  },
  { tags: ["art", "arts", "galleries", "gallery"], categories: ["gallery", "museum"] },
  { tags: ["music", "records", "vinyl", "instruments"], categories: ["music_shop", "bar"] },
  {
    tags: ["nature", "outdoors", "views", "scenery", "parks", "walks"],
    categories: ["attraction", "bath"],
  },
  { tags: ["onsen", "bath", "baths", "hot-spring", "relax"], categories: ["bath"] },
  { tags: ["stay", "hotel", "lodging", "inn"], categories: ["stay"] },
];

export type InterestResolution = {
  /** Each interest the traveller gave that Noren can map to categories. */
  matched: { tag: string; categories: ReadonlySet<string> }[];
  /** Interests Noren could not map. They tilt nothing. */
  unmatched: string[];
};

export function resolveInterests(
  tags: readonly string[],
  region: Pick<RegionConfig, "categories">,
): InterestResolution {
  const known = new Set((region.categories ?? []).map((category) => category.key));
  const matched: InterestResolution["matched"] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = normaliseTag(raw);
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    const rule = INTEREST_RULES.find((candidate) => candidate.tags.includes(tag));
    // A category key or label such as "museum" is an interest in that category.
    const categories = new Set(
      (
        rule?.categories ?? (known.has(tag.replace(/-/g, "_")) ? [tag.replace(/-/g, "_")] : [])
      ).filter((key) => known.has(key)),
    );
    if (categories.size === 0) unmatched.push(raw.trim());
    else matched.push({ tag: raw.trim(), categories });
  }
  return { matched, unmatched };
}

/** The traveller's own words for the interests a place fits; empty when it fits none. */
export function interestsFor(
  resolution: InterestResolution,
  category: string | undefined,
): string[] {
  if (category === undefined) return [];
  return resolution.matched
    .filter(({ categories }) => categories.has(category))
    .map(({ tag }) => tag);
}
