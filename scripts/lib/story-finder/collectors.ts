import {
  guessLang,
  listingNamesPlace,
  listingSharesName,
  mentionCanonicalUrl,
  postHasAdMarker,
  storedPostText,
  type MentionCandidate,
  type MentionPlatform,
} from "../../../src/lib/story-finder/mention";
import type { SourceAdapterId } from "../../../src/lib/domain/constants";
import {
  batches,
  chargeCap,
  distanceM,
  namesPlace,
  query,
  record,
  sameQuery,
  searchName,
  str,
  time,
  withCity,
  type CollectOptions,
  type Collector,
  type ListingProblem,
  type FinderPlace,
  type NormaliseContext,
  type PlannedQuery,
  type PlannedRun,
} from "./types";
import { decodeEntities, isSkippedHost } from "./web-page";

// Prices are the Apify Free-plan tier (the highest) from each actor's `pricingInfos`, read on
// 2026-11-04 with GET https://api.apify.com/v2/acts/<user>~<actor>. All six actors are
// pay-per-event: maxTotalChargeUsd caps a run, maxItems does not (it is for pay-per-result actors).
// Input and output field names come from GET .../builds/default (inputSchema, dataset schema, README).

/** Every adapter, so canonical addresses match what the Convex side computes for the region. */
const ALL_ADAPTERS: readonly SourceAdapterId[] = [
  "link_card",
  "meta_embed",
  "youtube",
  "x",
  "google_maps_link",
  "tiktok",
];

function candidate(
  platform: MentionPlatform,
  run: PlannedRun,
  context: NormaliseContext,
  planned: PlannedQuery,
  fields: Omit<
    MentionCandidate,
    | "platform"
    | "canonicalUrl"
    | "placeId"
    | "searchedFor"
    | "query"
    | "actorId"
    | "runId"
    | "collectionId"
    | "langGuess"
  > & {
    langGuess?: string;
  },
): MentionCandidate | null {
  const canonicalUrl = mentionCanonicalUrl(fields.url, ALL_ADAPTERS);
  // The ad screen runs on the whole post first: a label at the top or bottom of a long page is
  // outside the window cut below. (A web page arrives already cut by the page reader, which sets
  // fields.adMarker from the whole page.)
  const plain = plainText(fields.text);
  const adMarker = postHasAdMarker({ ...fields, text: plain });
  // Cut here as storyFinder.ingest cuts it, so a long page is not sent whole.
  const text = storedPostText(plain, planned.names);
  if (!canonicalUrl || !text) return null;
  return {
    platform,
    url: fields.url,
    canonicalUrl,
    ...(fields.authorName ? { authorName: fields.authorName } : {}),
    ...(fields.authorHandle ? { authorHandle: fields.authorHandle } : {}),
    ...(fields.authorUrl ? { authorUrl: fields.authorUrl } : {}),
    ...(fields.postedAt !== undefined ? { postedAt: fields.postedAt } : {}),
    text,
    ...(fields.title ? { title: plainText(fields.title) } : {}),
    ...(fields.locationName ? { locationName: plainText(fields.locationName) } : {}),
    langGuess: fields.langGuess ?? guessLang(text),
    ...(adMarker ? { adMarker } : {}),
    placeId: planned.placeId,
    searchedFor: planned.searchedFor,
    query: planned.query,
    actorId: run.actorId,
    runId: context.runId,
    collectionId: context.collectionId,
  };
}

/**
 * A scraped text as plain text: line-break tags (Google's review text carries <br>) become line
 * breaks, then common HTML entities (&amp;, &#39;) are decoded. In that order, so an escaped
 * "&lt;br&gt;" stays the words it is.
 */
export function plainText(text: string): string {
  return decodeEntities(text.replace(/<br\s*\/?>/giu, "\n"));
}

function dedupe(candidates: (MentionCandidate | null)[]): MentionCandidate[] {
  const seen = new Set<string>();
  const result: MentionCandidate[] = [];
  for (const item of candidates) {
    if (item === null) continue;
    const key = `${item.placeId} ${item.canonicalUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function placesWithName(places: readonly FinderPlace[], lang = "ja") {
  return places.flatMap((place) => {
    const name = searchName(place, lang);
    return name ? [{ place, name }] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// Google Maps reviews: compass/crawler-google-places
// https://apify.com/compass/crawler-google-places
// Input: searchStringsArray, maxCrawledPlacesPerSearch, language, maxReviews, reviewsSort,
// reviewsOrigin, scrapeReviewsPersonalData. Output: one item per place with searchString (the
// query, echoed), title, location{lat,lng}, reviews[]{name, text, publishedAtDate, reviewUrl,
// reviewerUrl, originalLanguage}. Stars and like counts are in the output and are never read.
// Price: place-scraped $0.004, place-details-scraped $0.002 (charged when reviews are on),
// review-scraped $0.0005, start $0.00005/GB; minimal maxTotalChargeUsd $0.50.
// ---------------------------------------------------------------------------------------------

/**
 * A listing this close to our pin is the place if its name fits (listingNamesPlace). Further off it
 * is not, whatever its name: a shop's other branches have their own entries on the map, so a far
 * listing belongs to one of those.
 */
export const SAME_PLACE_M = 300;
/**
 * A listing this close is also the place if it only shares a shorter name with ours
 * (listingSharesName): OSM's 「中華菜館 架空」 is Google's 「架空」 at the same door. Further off, the same
 * short word is more likely another shop.
 */
export const SHARED_NAME_M = 100;

/**
 * Whether the listing Google found is our place, and if it is, whether it is still open. A
 * listing that is not the place leaves a search for 「椿 長崎」 attaching some other 椿; a
 * permanently closed one is not ingested, and its place is listed at the end of the run.
 */
export function judgeListing(
  item: Record<string, unknown>,
  planned: PlannedQuery,
): ListingProblem | null {
  const name = str(item.title) ?? "";
  const location = record(item.location);
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  let isPlace: boolean;
  if (!planned.pin) isPlace = namesPlace(name, planned.names);
  else if (!hasPoint) isPlace = false;
  else {
    const metres = distanceM(planned.pin, { lat, lng });
    isPlace =
      metres <= SAME_PLACE_M &&
      (listingNamesPlace(name, planned.names) ||
        (metres <= SHARED_NAME_M && listingSharesName(name, planned.names)));
  }
  if (!isPlace) return "wrong_listing";
  return item.permanentlyClosed === true ? "closed_listing" : null;
}

export const googleReviews: Collector = {
  platform: "google_reviews",
  actorId: "compass/crawler-google-places",
  docUrl: "https://apify.com/compass/crawler-google-places",
  plan(places, { perPlace, batchSize }) {
    return batches(placesWithName(places), batchSize).map((batch) => {
      const queries = batch.map(({ place, name }) => query(place, withCity(name), name));
      const estimatedUsd = 0.001 + queries.length * (0.004 + 0.002 + perPlace * 0.0005);
      return {
        platform: "google_reviews",
        actorId: "compass/crawler-google-places",
        input: {
          searchStringsArray: queries.map((q) => q.query),
          // One place per search: the place the name finds, checked against our pin below.
          maxCrawledPlacesPerSearch: 1,
          language: "ja",
          maxReviews: perPlace,
          reviewsSort: "mostRelevant",
          reviewsOrigin: "google",
          // Reviewer names and profile links, as Google shows them publicly, credit the author.
          scrapeReviewsPersonalData: true,
          maxImages: 0,
          scrapeContacts: false,
        },
        queries,
        estimatedUsd,
        maxTotalChargeUsd: chargeCap(estimatedUsd, 0.5),
        maxItems: queries.length,
      };
    });
  },
  normalise(items, run, context) {
    const out: (MentionCandidate | null)[] = [];
    for (const raw of items) {
      const item = record(raw);
      const planned = run.queries.find((q) => sameQuery(str(item?.searchString), q.query));
      if (!item || !planned) continue;
      const problem = judgeListing(item, planned);
      const reviews = Array.isArray(item.reviews) ? item.reviews : [];
      const listing = str(item.title);
      if (problem !== null) {
        const tally = context.listings;
        if (tally) {
          tally.listings.push({
            problem,
            place: planned.searchedFor,
            slug: planned.slug,
            listing: listing ?? "",
          });
          for (const reviewRaw of reviews) {
            const url = str(record(reviewRaw)?.reviewUrl);
            const canonicalUrl = url ? mentionCanonicalUrl(url, ALL_ADAPTERS) : null;
            if (!canonicalUrl || !str(record(reviewRaw)?.text)) continue;
            if (problem === "wrong_listing") tally.wrongListing++;
            else tally.closedListing++;
            tally.excluded.push({ placeId: planned.placeId, canonicalUrl, problem });
          }
        }
        continue;
      }
      for (const reviewRaw of reviews) {
        const review = record(reviewRaw);
        const url = str(review?.reviewUrl);
        const text = str(review?.text);
        if (!review || !url || !text) continue;
        out.push(
          candidate("google_reviews", run, context, planned, {
            url,
            text,
            authorName: str(review.name),
            authorUrl: str(review.reviewerUrl),
            postedAt: time(review.publishedAtDate),
            langGuess: str(review.originalLanguage),
            // Google's own name for the place these reviews are on: a review rarely names its
            // shop, so the check reads this name beside the text (judgeListing has matched it to
            // our place).
            ...(listing ? { title: listing, locationName: listing } : {}),
          }),
        );
      }
    }
    return dedupe(out);
  },
};

// ---------------------------------------------------------------------------------------------
// Instagram: apify/instagram-hashtag-scraper with keyword search
// https://apify.com/apify/instagram-hashtag-scraper
// Input: hashtags (the keywords; items may not contain . , : ; - + = * & % $ # @ / ~ ^ | < > ( )
// [ ] { } " ' `), keywordSearch: true, resultsType "posts", resultsLimit (per keyword).
// Output: one item per post with url, shortCode, caption, ownerUsername, timestamp, locationName,
// searchTerm / inputUrl (?q=<keyword>). Price: result $0.0026; minimal cap $0.0026.
// (apify/instagram-scraper's place search returns place items with only a few embedded posts.)
// ---------------------------------------------------------------------------------------------

/** A keyword the actor's input pattern accepts. */
export function instagramKeyword(name: string): string {
  return name
    .replace(/[!?.,:;\-+=*&%$#@/\\~^|<>()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordOf(item: Record<string, unknown>): string | undefined {
  const term = str(item.searchTerm);
  if (term) return term;
  const input = str(item.inputUrl);
  if (!input) return undefined;
  try {
    return new URL(input).searchParams.get("q") ?? undefined;
  } catch {
    return undefined;
  }
}

export const instagram: Collector = {
  platform: "instagram",
  actorId: "apify/instagram-hashtag-scraper",
  docUrl: "https://apify.com/apify/instagram-hashtag-scraper",
  plan(places, { perPlace, batchSize }) {
    const named = placesWithName(places).flatMap(({ place, name }) => {
      const keyword = instagramKeyword(withCity(name));
      return keyword.length >= 2 ? [query(place, keyword, name)] : [];
    });
    return batches(named, batchSize).map((queries) => {
      const estimatedUsd = queries.length * perPlace * 0.0026;
      return {
        platform: "instagram",
        actorId: "apify/instagram-hashtag-scraper",
        input: {
          hashtags: queries.map((q) => q.query),
          keywordSearch: true,
          resultsType: "posts",
          resultsLimit: perPlace,
        },
        queries,
        estimatedUsd,
        maxTotalChargeUsd: chargeCap(estimatedUsd, 0.0026),
        maxItems: queries.length * perPlace,
      };
    });
  },
  normalise(items, run, context) {
    const out: (MentionCandidate | null)[] = [];
    for (const raw of items) {
      const item = record(raw);
      const planned = item && run.queries.find((q) => sameQuery(keywordOf(item), q.query));
      const shortCode = str(item?.shortCode);
      const url =
        str(item?.url) ?? (shortCode ? `https://www.instagram.com/p/${shortCode}/` : undefined);
      const text = str(item?.caption);
      if (!item || !planned || !url || !text) continue;
      const username = str(item.ownerUsername);
      out.push(
        candidate("instagram", run, context, planned, {
          url,
          text,
          authorHandle: username,
          authorUrl: username ? `https://www.instagram.com/${username}/` : undefined,
          postedAt: time(item.timestamp),
          locationName: str(item.locationName),
        }),
      );
    }
    return dedupe(out);
  },
};

// ---------------------------------------------------------------------------------------------
// Facebook: apify/facebook-search-scraper with searchType "posts"
// https://apify.com/apify/facebook-search-scraper
// Input: categories (the keywords), searchType "posts", resultsLimit (for the whole run, so one
// place per run). Output: url, text, time, user{name, profileUrl}, pageName (string or {name}).
// Price: facebook-result $0.006, actor-start $0.001; minimal cap $0.024.
// (apify/facebook-posts-scraper needs page URLs and cannot search.)
// ---------------------------------------------------------------------------------------------

export const facebook: Collector = {
  platform: "facebook",
  actorId: "apify/facebook-search-scraper",
  docUrl: "https://apify.com/apify/facebook-search-scraper",
  plan(places, { perPlace }) {
    return placesWithName(places).map(({ place, name }) => {
      const planned = query(place, withCity(name), name);
      const estimatedUsd = 0.001 + perPlace * 0.006;
      return {
        platform: "facebook",
        actorId: "apify/facebook-search-scraper",
        input: { categories: [planned.query], searchType: "posts", resultsLimit: perPlace },
        queries: [planned],
        estimatedUsd,
        maxTotalChargeUsd: chargeCap(estimatedUsd, 0.024),
        maxItems: perPlace,
      };
    });
  },
  normalise(items, run, context) {
    const planned = run.queries[0];
    if (!planned) return [];
    const out: (MentionCandidate | null)[] = [];
    for (const raw of items) {
      const item = record(raw);
      const url = str(item?.url);
      const text = str(item?.text);
      if (!item || !url || !text) continue;
      const user = record(item.user);
      const page = record(item.pageName);
      out.push(
        candidate("facebook", run, context, planned, {
          url,
          text,
          authorName: str(user?.name) ?? str(page?.name) ?? str(item.pageName),
          authorUrl: str(user?.profileUrl),
          postedAt: time(item.time) ?? time(item.timestamp),
        }),
      );
    }
    return dedupe(out);
  },
};

// ---------------------------------------------------------------------------------------------
// TikTok: clockworks/free-tiktok-scraper
// https://apify.com/clockworks/free-tiktok-scraper
// Input: searchQueries, searchSection "/video", resultsPerPage (per query). Sorting, date filter and
// proxy country are paid add-ons and stay at their defaults. Output: webVideoUrl, text,
// textLanguage, createTimeISO, authorMeta{name, profileUrl}, searchQuery (echoed); a failed query
// comes back as {error, errorCode}. Price: result $0.003; no start fee, no minimal cap.
// ---------------------------------------------------------------------------------------------

export const tiktok: Collector = {
  platform: "tiktok",
  actorId: "clockworks/free-tiktok-scraper",
  docUrl: "https://apify.com/clockworks/free-tiktok-scraper",
  plan(places, { perPlace, batchSize }) {
    const named = placesWithName(places).map(({ place, name }) =>
      query(place, withCity(name), name),
    );
    return batches(named, batchSize).map((queries) => {
      const estimatedUsd = queries.length * perPlace * 0.003;
      return {
        platform: "tiktok",
        actorId: "clockworks/free-tiktok-scraper",
        input: {
          searchQueries: queries.map((q) => q.query),
          searchSection: "/video",
          resultsPerPage: perPlace,
        },
        queries,
        estimatedUsd,
        maxTotalChargeUsd: chargeCap(estimatedUsd, 0.01),
        maxItems: queries.length * perPlace,
      };
    });
  },
  normalise(items, run, context) {
    const out: (MentionCandidate | null)[] = [];
    for (const raw of items) {
      const item = record(raw);
      if (!item || item.error !== undefined) continue;
      const planned = run.queries.find((q) => sameQuery(str(item.searchQuery), q.query));
      const url = str(item.webVideoUrl);
      const text = str(item.text);
      if (!planned || !url || !text) continue;
      const author = record(item.authorMeta);
      const name = str(author?.name);
      out.push(
        candidate("tiktok", run, context, planned, {
          url,
          text,
          authorHandle: name ? `@${name}` : undefined,
          authorUrl: str(author?.profileUrl),
          postedAt: time(item.createTimeISO) ?? time(item.createTime),
          langGuess: str(item.textLanguage),
        }),
      );
    }
    return dedupe(out);
  },
};

// ---------------------------------------------------------------------------------------------
// Reddit: harshmaur/reddit-scraper
// https://apify.com/harshmaur/reddit-scraper
// Input: searchTerms, searchPosts, searchComments, searchSort, searchTime, maxPostsCount and
// maxCommentsCount (per keyword), crawlCommentsPerPost false, includeNSFW false. Output: dataType
// "post" {postUrl, title, body, authorName, createdAt} or "comment" {url, body, authorName,
// commentCreatedAt}, both with searchTerm. Price: result $0.002, init $0.02; no minimal cap.
// (trudax/reddit-scraper-lite: 86% run success over 30 days and no echoed search term.)
// ---------------------------------------------------------------------------------------------

export const reddit: Collector = {
  platform: "reddit",
  actorId: "harshmaur/reddit-scraper",
  docUrl: "https://apify.com/harshmaur/reddit-scraper",
  plan(places, { perPlace, batchSize }) {
    // Reddit is mostly English: search the English name with the city, else the Japanese one.
    const named = places.flatMap((place) => {
      // searchName falls back to any language, so ask only when the place has an English name.
      const en = place.names.some((n) => n.lang === "en") ? searchName(place, "en") : undefined;
      const name = en ?? searchName(place);
      if (!name) return [];
      return [query(place, en ? `"${en}" Nagasaki` : withCity(name), name)];
    });
    const posts = Math.max(1, Math.ceil(perPlace / 2));
    // At most 40 keywords per run are searched on Apify's free plan.
    return batches(named, Math.min(batchSize, 40)).map((queries) => {
      const estimatedUsd = 0.02 + queries.length * (posts * 2) * 0.002;
      return {
        platform: "reddit",
        actorId: "harshmaur/reddit-scraper",
        input: {
          searchTerms: queries.map((q) => q.query),
          searchPosts: true,
          searchComments: true,
          searchSort: "relevance",
          searchTime: "all",
          maxPostsCount: posts,
          maxCommentsCount: posts,
          crawlCommentsPerPost: false,
          includeNSFW: false,
        },
        queries,
        estimatedUsd,
        maxTotalChargeUsd: chargeCap(estimatedUsd, 0.02),
        maxItems: queries.length * posts * 2,
      };
    });
  },
  normalise(items, run, context) {
    const out: (MentionCandidate | null)[] = [];
    for (const raw of items) {
      const item = record(raw);
      if (!item || (item.dataType !== "post" && item.dataType !== "comment")) continue;
      const planned = run.queries.find((q) => sameQuery(str(item.searchTerm), q.query));
      if (!planned) continue;
      const post = item.dataType === "post";
      const url = post ? (str(item.postUrl) ?? str(item.url)) : str(item.url);
      const text = post
        ? [str(item.title), str(item.body)].filter(Boolean).join("\n\n")
        : (str(item.body) ?? "");
      const author = str(item.authorName);
      if (!url || !text) continue;
      out.push(
        candidate("reddit", run, context, planned, {
          url,
          text,
          authorHandle: author ? `u/${author}` : undefined,
          authorUrl: author
            ? `https://www.reddit.com/user/${encodeURIComponent(author)}/`
            : undefined,
          postedAt: time(post ? item.createdAt : item.commentCreatedAt),
          title: post ? str(item.title) : undefined,
        }),
      );
    }
    return dedupe(out);
  },
};

// ---------------------------------------------------------------------------------------------
// Blogs and other web pages: apify/google-search-scraper, then each page read by web-page.ts
// https://apify.com/apify/google-search-scraper
// Input: queries (newline-separated), maxPagesPerQuery, countryCode "jp", searchLanguage "ja",
// languageCode "ja", saveHtmlToKeyValueStore false. Output: one item per results page with
// searchQuery{term}, organicResults[]{url, title, description}. Price: search-page-scraped
// $0.0045 (about 10 results), start $0.00005/GB; minimal cap $0.50.
// ---------------------------------------------------------------------------------------------

/** A search result to read, before its page text is fetched. */
export type WebHit = { url: string; title?: string; planned: PlannedQuery };

export const web: Collector & {
  hits(items: readonly unknown[], run: PlannedRun, perPlace: number): WebHit[];
} = {
  platform: "web",
  actorId: "apify/google-search-scraper",
  docUrl: "https://apify.com/apify/google-search-scraper",
  plan(places, { batchSize }: CollectOptions) {
    const named = placesWithName(places).map(({ place, name }) =>
      query(place, `"${name}" 長崎 ブログ`, name),
    );
    return batches(named, batchSize).map((queries) => {
      const estimatedUsd = 0.001 + queries.length * 0.0045;
      return {
        platform: "web",
        actorId: "apify/google-search-scraper",
        input: {
          queries: queries.map((q) => q.query).join("\n"),
          maxPagesPerQuery: 1,
          countryCode: "jp",
          searchLanguage: "ja",
          languageCode: "ja",
          saveHtmlToKeyValueStore: false,
          includeUnfilteredResults: false,
        },
        queries,
        estimatedUsd,
        maxTotalChargeUsd: chargeCap(estimatedUsd, 0.5),
        maxItems: queries.length,
      };
    });
  },
  hits(items, run, perPlace) {
    const hits: WebHit[] = [];
    for (const raw of items) {
      const item = record(raw);
      const term = str(record(item?.searchQuery)?.term);
      const planned = run.queries.find((q) => sameQuery(term, q.query));
      if (!item || !planned) continue;
      let kept = 0;
      for (const resultRaw of Array.isArray(item.organicResults) ? item.organicResults : []) {
        const result = record(resultRaw);
        const url = str(result?.url);
        if (!url || kept >= perPlace) continue;
        let host: string;
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
          host = parsed.hostname;
        } catch {
          continue;
        }
        if (isSkippedHost(host)) continue;
        hits.push({ url, title: str(result?.title), planned });
        kept++;
      }
    }
    return hits;
  },
  // Search results alone carry no quotable text; runner.ts reads each page (web-page.ts) and then
  // calls webCandidate.
  normalise: () => [],
};

/**
 * A web page's text as a candidate, once web-page.ts has read it. `page.url` is where the page was
 * read after any redirects, so the link goes to what was read.
 */
export function webCandidate(
  hit: WebHit,
  page: { url?: string; text: string; author?: string; publishedAt?: number; adMarker?: boolean },
  run: PlannedRun,
  context: NormaliseContext,
): MentionCandidate | null {
  const url = page.url ?? hit.url;
  return candidate("web", run, context, hit.planned, {
    url,
    text: page.text,
    title: hit.title,
    authorName: page.author ?? new URL(url).hostname,
    postedAt: page.publishedAt,
    ...(page.adMarker ? { adMarker: true } : {}),
  });
}

export const COLLECTORS: Readonly<Record<MentionPlatform, Collector>> = {
  google_reviews: googleReviews,
  instagram,
  facebook,
  tiktok,
  reddit,
  web,
};
