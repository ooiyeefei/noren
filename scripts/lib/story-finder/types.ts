import type { MentionCandidate, MentionPlatform } from "../../../src/lib/story-finder/mention";

/** A place to search for, as storyFinder:placesToSearch returns it. */
export type FinderPlace = {
  placeId: string;
  slug: string;
  category: string;
  names: { lang: string; script: string; value: string; isPrimary: boolean }[];
  pin: { lat: number; lng: number } | null;
};

/** One search inside a run, tied to the place it is for. */
export type PlannedQuery = {
  placeId: string;
  /** Kept so a saved run can be replayed into another deployment, where place ids differ. */
  slug: string;
  query: string;
  /** The place name the query is built from. */
  searchedFor: string;
  /** Every name of the place, used to check that a result is about it. */
  names: string[];
  pin: { lat: number; lng: number } | null;
};

/** One actor run the collector will start. */
export type PlannedRun = {
  platform: MentionPlatform;
  actorId: string;
  input: Record<string, unknown>;
  queries: PlannedQuery[];
  /** The expected cost from the actor's published prices. */
  estimatedUsd: number;
  /**
   * The cap sent as the run's maxTotalChargeUsd: the most the run can cost, so the budget is checked
   * against it before the run starts. Never below the actor's minimum.
   */
  maxTotalChargeUsd: number;
  /** Sent as maxItems; honoured by pay-per-result actors (all six chosen are pay-per-event). */
  maxItems: number;
};

export type CollectOptions = {
  /** Posts or reviews asked for per place. */
  perPlace: number;
  /** Places per actor run, where the actor echoes the query in each item. */
  batchSize: number;
};

export type NormaliseContext = {
  runId: string;
  /** The collect run the candidates belong to; the per-author limit counts within it. */
  collectionId: string;
  /** Where the Google collector records the listings and reviews it leaves out. */
  listings?: ListingTally;
};

/** Why a Google listing's reviews are left out. */
export type ListingProblem = "wrong_listing" | "closed_listing";

/**
 * The Google listings (and their reviews) left out of a run: the listing is not the place we
 * searched for, or is permanently closed. Counted in reviews, since each would have been a candidate.
 */
export type ListingTally = {
  wrongListing: number;
  closedListing: number;
  /** Each listing once, with the place it was searched for, for a steward to look at. */
  listings: { problem: ListingProblem; place: string; slug: string; listing: string }[];
  /** The reviews left out, so a replay can reject the rows already ingested from them. */
  excluded: { placeId: string; canonicalUrl: string; problem: ListingProblem }[];
};

export function newListingTally(): ListingTally {
  return { wrongListing: 0, closedListing: 0, listings: [], excluded: [] };
}

/** A run's tally as it is logged: counts, and the places and listings behind them. */
export function summariseListings(tally: ListingTally) {
  return {
    wrongListing: tally.wrongListing,
    closedListing: tally.closedListing,
    wrongListings: tally.listings
      .filter((entry) => entry.problem === "wrong_listing")
      .map(({ place, slug, listing }) => ({ place, slug, listing })),
    // For a steward to review: the place itself is not changed.
    closedPlaces: tally.listings
      .filter((entry) => entry.problem === "closed_listing")
      .map(({ place, slug, listing }) => ({ place, slug, listing })),
  };
}

/**
 * One source of public posts behind one Apify actor. `plan` and `normalise` are pure, so they are
 * tested on recorded-shape fixtures; `enrich` may fetch (the web collector reads the pages).
 */
export type Collector = {
  platform: MentionPlatform;
  actorId: string;
  /** The actor's documentation, where its input and output fields were read. */
  docUrl: string;
  plan(places: readonly FinderPlace[], options: CollectOptions): PlannedRun[];
  normalise(
    items: readonly unknown[],
    run: PlannedRun,
    context: NormaliseContext,
  ): MentionCandidate[];
};

/** A run's worst case with a margin, never below the actor's minimum cap. */
export function chargeCap(estimatedUsd: number, minimumUsd: number): number {
  return Math.round(Math.max(minimumUsd, estimatedUsd * 1.25) * 1000) / 1000;
}

export function batches<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) result.push(items.slice(i, i + size));
  return result;
}

/** The name to search with: the primary Japanese name, else any primary name, else the first. */
export function searchName(place: FinderPlace, lang = "ja"): string | undefined {
  const inLang = place.names.filter((name) => name.lang === lang);
  return (
    (inLang.find((name) => name.isPrimary) ?? inLang[0])?.value ??
    (place.names.find((name) => name.isPrimary) ?? place.names[0])?.value
  )?.trim();
}

/** The place's name with 長崎 added unless it already says so. */
export function withCity(name: string, city = "長崎"): string {
  return name.includes(city) ? name : `${name} ${city}`;
}

export function query(place: FinderPlace, text: string, searchedFor: string): PlannedQuery {
  return {
    placeId: place.placeId,
    slug: place.slug,
    query: text,
    searchedFor,
    names: place.names.map((name) => name.value),
    pin: place.pin,
  };
}

/** For matching an echoed query back to the place it was for. */
export function sameQuery(a: string | undefined, b: string): boolean {
  if (typeof a !== "string") return false;
  const norm = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An ISO date or Unix seconds as milliseconds since the epoch. */
export function time(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Shared with the Convex check, which applies the same test before anything is shown. */
export { namesPlace } from "../../../src/lib/story-finder/mention";
