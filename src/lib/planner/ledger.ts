import { badgeMessages } from "../i18n/messages/badges";
import type { PlaceResult } from "../connector/place";
import type { OmikujiResult, PlaceBundle, WalkRequest, WalkResult } from "../connector/types";
import type { PlannerPlace, PlannerQuote } from "./reply";

// What this one question has learned from Noren's tools. Everything the model may refer to has to be
// here: a quote the tools returned, a place they returned. The checks in resolve.ts open the model's
// answer against this ledger, so a made-up quote or place cannot get through. A new ledger is made for
// every question, so nothing carries over between turns.

export type WalkRecord = {
  request: WalkRequest;
  result: Extract<WalkResult, { ok: true }>;
};

/** Draws a question may make. Each one adds to the anonymous exposure count and costs a rate-limit slot. */
export const MAX_WALK_DRAWS = 2;
export const MAX_OMIKUJI_DRAWS = 1;
/** Pages a question may open. Each is six reads of Noren's data. */
export const MAX_PLACE_LOOKUPS = 8;

const MACHINE_TRANSLATION = badgeMessages.en.machineTranslation;

/** A place a tool returned: its slug, its display name and each name it has, in any script. */
export type KnownPlace = { slug: string; name: string; names: string[]; hasStory: boolean };
type PlaceLike = {
  slug: string;
  name: string;
  names: readonly { value: string }[];
  hasStory?: boolean;
};

export class TurnLedger {
  readonly quotes = new Map<string, PlannerQuote>();
  /** Every place a tool returned this turn, by slug. */
  readonly places = new Map<string, KnownPlace>();
  readonly walks: WalkRecord[] = [];
  omikuji: Extract<OmikujiResult, { ok: true }> | null = null;
  /** The bundles read this turn, for what the formatted result leaves out (how many posts were read). */
  readonly bundles = new Map<string, PlaceBundle>();
  /** Reads started by code (a drawn stop's page); settle them before the answer is checked. */
  readonly pending: Promise<unknown>[] = [];
  walkDraws = 0;
  omikujiDraws = 0;
  lookups = 0;
  /** Search and place-page calls that returned data: the proof a "nobody wrote about it" rests on. */
  searches = 0;
  /** A tool failed in a way the person should be told about (Noren's data could not be read). */
  dataFailed = false;
  private counter = 0;

  async settled(): Promise<void> {
    await Promise.all(this.pending);
  }

  nextQuoteId(): string {
    return `q${++this.counter}`;
  }

  addPlaces(rows: readonly PlaceLike[]): void {
    for (const row of rows) {
      this.places.set(row.slug, {
        slug: row.slug,
        name: row.name,
        names: row.names.map((name) => name.value),
        hasStory: row.hasStory ?? false,
      });
    }
  }

  /**
   * The draw whose stops the page shows: the last one that found any. When none did, the last draw,
   * so the page can say that nothing near the start fit and which rules were in play.
   */
  chosenWalk(): WalkRecord | null {
    return this.walks.findLast((walk) => walk.result.stops.length > 0) ?? this.walks.at(-1) ?? null;
  }

  /**
   * Whether anyone has written about this place, counting what the model was not allowed to see: a
   * story whose writer did not tick the box still means "somebody wrote about this".
   */
  hasWordsAt(slug: string): boolean {
    if (this.quotesAt(slug).length > 0 || this.places.get(slug)?.hasStory === true) return true;
    const bundle = this.bundles.get(slug);
    return (
      bundle !== undefined &&
      (bundle.stories.length > 0 || bundle.sources.length > 0 || bundle.placeStory !== null)
    );
  }

  quotesAt(slug: string): PlannerQuote[] {
    return [...this.quotes.values()].filter((quote) => quote.slug === slug);
  }
}

export function toPlannerPlace(row: {
  slug: string;
  name: string;
  category: PlannerPlace["category"];
  neighbourhood: PlannerPlace["neighbourhood"];
  hasStory: boolean;
  confirmation: { confirmed: boolean };
  demo?: string;
}): PlannerPlace {
  return {
    slug: row.slug,
    name: row.name,
    category: row.category,
    neighbourhood: row.neighbourhood,
    hasStory: row.hasStory,
    confirmed: row.confirmation.confirmed,
    demo: row.demo !== undefined,
  };
}

/**
 * Finds the words in a place's page that a person may be shown as a quote, gives each an id, and
 * returns the same result with the ids added, for the model to read. The words themselves are copied
 * as they are. Anything that is not someone's own words (the place's names, a link, a count) is not a
 * quote.
 */
export function annotatePlace(
  result: PlaceResult,
  bundle: PlaceBundle | undefined,
  ledger: TurnLedger,
): PlaceResult & Record<string, unknown> {
  const { slug, name } = result.place;
  const base = { slug, placeName: name, translations: [], sources: [], aiAssisted: false };
  const add = (
    quote: Partial<Omit<PlannerQuote, "id" | "slug" | "placeName" | "kind" | "text">> &
      Pick<PlannerQuote, "kind" | "text">,
  ) => {
    const id = ledger.nextQuoteId();
    ledger.quotes.set(id, { demo: false, ...base, ...quote, id });
    return id;
  };

  const ownerStatements = result.ownerStatements.map((statement) => ({
    ...statement,
    quoteId: add({
      kind: "owner",
      text: statement.text,
      language: statement.language,
      translations: statement.translations.map((t) => ({
        language: t.language,
        text: t.text,
        origin: t.label === MACHINE_TRANSLATION ? ("machine" as const) : ("human" as const),
      })),
      aiAssisted: statement.aiAssisted !== undefined,
      demo: statement.demo !== undefined,
      ...(statement.credit === undefined ? {} : { link: statement.credit.source }),
    }),
  }));

  const cautions = result.cautions.map((caution) => ({
    ...caution,
    quoteId: add({
      kind: "owner",
      text: caution.ownerWords.text,
      language: caution.ownerWords.language,
      demo: caution.demo !== undefined,
      ...(caution.label === null ? {} : { topic: caution.label }),
    }),
  }));

  const stories = result.memberStories.stories.map((story) => ({
    ...story,
    quoteId: add({
      kind: "story",
      text: story.text,
      language: story.language,
      by: story.writer,
      on: story.writtenOn,
      demo: story.demo !== undefined,
      ...(story.photos === undefined ? {} : { photoCredit: story.photos.credit }),
    }),
  }));

  const sharedPosts = (result.memberStories.sharedPosts ?? []).map((post) => ({
    ...post,
    ...(post.note === null || post.note.trim() === ""
      ? {}
      : {
          quoteId: add({
            kind: "story",
            text: post.note,
            ...(post.noteLanguage === null ? {} : { language: post.noteLanguage }),
            ...(post.sharedBy === null ? {} : { by: post.sharedBy }),
            link: post.link,
            platform: post.platform,
            demo: post.demo !== undefined,
          }),
        }),
  }));

  const foundPosts = result.foundPosts.map((post) => ({
    ...post,
    ...(post.quote === undefined
      ? {}
      : {
          quoteId: add({
            kind: "found",
            text: post.quote,
            ...(post.quoteLanguage === null || post.quoteLanguage === undefined
              ? {}
              : { language: post.quoteLanguage }),
            ...(post.author === null ? {} : { by: post.author }),
            link: post.link,
            platform: post.platform,
            ...(post.postedOn === undefined ? {} : { on: post.postedOn }),
            translations: (post.translations ?? []).map((t) => ({
              language: t.language,
              text: t.text,
              origin: "machine" as const,
            })),
            demo: post.demo !== undefined,
          }),
        }),
  }));

  const stitched = result.stitchedStory;
  const postsRead = bundle?.placeStory?.postsRead;
  const stitchedStory =
    stitched === null
      ? null
      : {
          ...stitched,
          sentences: stitched.sentences.map((sentence) => ({
            ...sentence,
            quoteId: add({
              kind: "stitched",
              text: sentence.en,
              textJa: sentence.ja,
              sources: stitched.sources
                .filter((source) => sentence.sources.includes(source.number))
                .map((source) => ({
                  number: source.number,
                  words: source.words,
                  link: source.link,
                  ...(source.language == null ? {} : { language: source.language }),
                  ...(source.platform == null ? {} : { platform: source.platform }),
                  ...(source.author == null ? {} : { author: source.author }),
                  ...(source.postedOn === undefined ? {} : { on: source.postedOn }),
                })),
              ...(postsRead === undefined ? {} : { postsRead }),
            }),
          })),
        };

  return {
    ...result,
    ownerStatements,
    cautions,
    memberStories: {
      ...result.memberStories,
      stories,
      ...(sharedPosts.length > 0 ? { sharedPosts } : {}),
    },
    foundPosts,
    stitchedStory,
  } as PlaceResult & Record<string, unknown>;
}
