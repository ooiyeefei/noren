// Fixtures for the planner's tests: fictional places, the data interface the tools read, and a
// scripted model that stands in for Claude or Meta. Relative imports only, because Convex's own type
// check (convex/tsconfig.json) reaches this file through convex/planner.test.ts and has no "@/" alias.
import { MockLanguageModelV4 } from "ai/test";
import nagasaki from "../../regions/nagasaki.json";
import type {
  ConnectorData,
  ListedPlace,
  PlaceBundle,
  WalkRequest,
  WalkResult,
} from "../../src/lib/connector/types";
import { regionSchema } from "../../src/lib/region/schema";

export const region = regionSchema.parse(nagasaki);
export const ORIGIN = "https://noren.test";
export const NOW = Date.UTC(2026, 10, 10, 3, 0, 0);

/** Fixtures are partial on purpose: the tools must read only the fields they are given. */
const as = <T>(value: unknown) => value as T;

export const names = (english: string | null, japanese: string | null) => [
  ...(english ? [{ lang: "en", script: "latin", value: english, isPrimary: true }] : []),
  ...(japanese ? [{ lang: "ja", script: "kanji", value: japanese, isPrimary: true }] : []),
];

export function listed(over: Record<string, unknown> & { slug: string }): ListedPlace {
  return as<ListedPlace>({
    _id: `id-${over.slug}`,
    regionId: "nagasaki",
    kind: "business",
    visibility: "public",
    isMock: false,
    category: "cafe",
    names: names("Test Cafe", "テストカフェ"),
    pin: { lat: 32.7437, lng: 129.8728 },
    hasStory: false,
    ...over,
  });
}

export const PLACES: ListedPlace[] = [
  listed({
    slug: "dejima-museum",
    category: "museum",
    names: names("Dejima Museum", "出島資料館"),
    confirmedAt: 1,
    hasStory: true,
  }),
  listed({
    slug: "shinchi-noodles",
    category: "restaurant",
    names: names("Shinchi Noodles", "新地ヌードル"),
    pin: { lat: 32.7415, lng: 129.8755 },
    hasStory: true,
  }),
  listed({
    slug: "quiet-kiosk",
    category: "shop",
    names: names("Quiet Kiosk", "静かな売店"),
    pin: { lat: 32.7418, lng: 129.8758 },
  }),
];

const story = (n: number, writer: string, body: string, lang = "en") => ({
  _id: `story-${n}`,
  body,
  lang,
  authorName: writer,
  authorKey: `key-${n}`,
  addedAt: NOW - n * 86_400_000,
  isMock: false,
  addedByMe: false,
  canRemove: false,
  photos: [],
  // The planner reads under "all-shown", so a writer who never ticked the connector box still counts.
  connectorAllowed: false,
});

export const STORY_TEXT = {
  ai: "The cat on the steps lets you stroke it if you bring fish.",
  mika: "Mika's grandmother taught me to fold the paper crane here.",
  noodles: "The broth is the same one the founder boiled in 1952.",
};

/** The place pages the tools can open. Dejima has every layer; the noodle shop has one story. */
export function bundleFor(slug: string): PlaceBundle | null {
  const list = PLACES.find((place) => place.slug === slug);
  if (list === undefined) return null;
  const base = {
    place: {
      _id: `id-${slug}`,
      regionId: "nagasaki",
      slug,
      kind: "business",
      visibility: "public",
      category: list.category,
      isMock: false,
      names: list.names,
      pin: list.pin,
      confirmedAt: list.confirmedAt,
      dataSources: [],
    },
    stories: [] as unknown[],
    placeStory: null as unknown,
    page: null,
    sources: [] as unknown[],
    set: null,
  };
  if (slug === "dejima-museum") {
    base.stories = [
      story(1, "Ai Tanaka", STORY_TEXT.ai),
      story(2, "Mika Sato", STORY_TEXT.mika, "en"),
    ];
    base.sources = [
      {
        _id: "src-1",
        platform: "google_reviews",
        canonicalUrl: "https://example.test/review/1",
        foundInPublicPost: true,
        foundKind: "story",
        excerpt: "二階の窓から港が見えます",
        excerptLang: "ja",
        excerptTranslations: [
          { lang: "en", text: "You can see the harbour from the upstairs window." },
        ],
        authorHandle: "harbour_fan",
        postedAt: NOW - 30 * 86_400_000,
        isMock: false,
      },
    ];
    base.placeStory = {
      postsRead: 3,
      sentences: [
        {
          en: "Visitors talk about the harbour view.",
          ja: "訪れた人は港の眺めを語ります。",
          notes: [0],
        },
        { en: "Another visitor mentions the cat.", ja: "猫の話もあります。", notes: [1] },
      ],
      notes: [
        {
          sourceId: "src-1",
          words: "港が見える",
          lang: "ja",
          platform: "google_reviews",
          canonicalUrl: "https://example.test/review/1",
          authorHandle: "harbour_fan",
          countsVisits: false,
        },
        {
          sourceId: "src-2",
          words: "A cat sleeps by the door",
          lang: "en",
          platform: "google_reviews",
          canonicalUrl: "https://example.test/review/2",
          countsVisits: false,
        },
      ],
    };
  }
  if (slug === "shinchi-noodles") {
    base.stories = [story(3, "Ken Mori", STORY_TEXT.noodles)];
  }
  return as<PlaceBundle>(base);
}

export function stop(
  slug: string,
  over: Partial<{
    wildCard: boolean;
    matchedInterests: string[];
    minutes: number;
    metres: number;
  }> = {},
) {
  const place = PLACES.find((candidate) => candidate.slug === slug)!;
  return {
    slug,
    names: place.names as never,
    category: place.category,
    neighbourhoodId: slug === "dejima-museum" ? "dejima" : "shinchi",
    ...(place.confirmedAt === undefined ? {} : { confirmedAt: place.confirmedAt }),
    hasStory: place.hasStory,
    wildCard: over.wildCard ?? false,
    matchedInterests: over.matchedInterests ?? [],
    leg: { metres: over.metres ?? 300, minutes: over.minutes ?? 4 },
  };
}

export function walkOf(over: Partial<Extract<WalkResult, { ok: true }>> = {}): WalkResult {
  return {
    ok: true,
    start: {
      kind: "neighbourhood",
      neighbourhoodId: "shinchi",
      names: names("Shinchi", "新地中華街") as never,
    },
    stops: [
      stop("shinchi-noodles", { minutes: 3, matchedInterests: [] }),
      stop("dejima-museum", { minutes: 6, matchedInterests: ["history"] }),
      stop("quiet-kiosk", { minutes: 5, wildCard: true }),
    ],
    rulesApplied: [],
    rulesNotChecked: [],
    interestsNotMatched: [],
    ...over,
  };
}

export type DataCalls = {
  walks: WalkRequest[];
  bundles: string[];
  omikuji: unknown[];
  listings: number;
};

export function fakePlannerData(over: Partial<ConnectorData> = {}) {
  const calls: DataCalls = { walks: [], bundles: [], omikuji: [], listings: 0 };
  const data: ConnectorData = {
    async listPlaces() {
      calls.listings++;
      return PLACES;
    },
    async placeBundle(slug) {
      calls.bundles.push(slug);
      return bundleFor(slug);
    },
    async listSets() {
      return [];
    },
    async walk(request) {
      calls.walks.push(request);
      return walkOf();
    },
    async omikuji(request) {
      calls.omikuji.push(request);
      return { ok: false, reason: "no_places" };
    },
    ...over,
  };
  return { data, calls };
}

// ---------------------------------------------------------------------------------------------
// The scripted model

type Prompt = MockLanguageModelV4["doGenerateCalls"][number]["prompt"];

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

export type Call = { name: string; input: unknown };
export type Script = (context: { prompt: Prompt; step: number }) => Call[] | "text";

/** A model that follows a script: each step names the tool calls to make, or ends with plain text. */
export function scriptedModel(steps: Script[]) {
  let index = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const script = steps[index];
      if (!script) throw new Error("no more scripted steps");
      const step = index++;
      const calls = script({ prompt: options.prompt, step });
      if (calls === "text") {
        return {
          content: [{ type: "text" as const, text: "Here is a lovely walk for you." }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      return {
        content: calls.map(({ name, input }, n) => ({
          type: "tool-call" as const,
          toolCallId: `call-${step}-${n}`,
          toolName: name,
          input: JSON.stringify(input),
        })),
        finishReason: { unified: "tool-calls" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  return model;
}

/** Every `{ quoteId, ... }` object in the tool results the model has been shown so far. */
export function quotesShown(prompt: Prompt) {
  const found: { quoteId: string; text: string }[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record.quoteId === "string") {
        const text = record.text ?? record.quote ?? record.en ?? record.ownerWords;
        found.push({
          quoteId: record.quoteId,
          text: typeof text === "string" ? text : JSON.stringify(text),
        });
      }
      Object.values(record).forEach(walk);
    }
  };
  for (const message of prompt)
    if (message.role === "tool") walk(JSON.parse(JSON.stringify(message.content)));
  return found;
}

/** The id of the quote whose text contains the fragment. Throws if the model was never shown it. */
export function idOf(prompt: Prompt, fragment: string): string {
  const hit = quotesShown(prompt).find((quote) => quote.text.includes(fragment));
  if (!hit) throw new Error(`no quote with "${fragment}" was shown to the model`);
  return hit.quoteId;
}

export const emptySubmit = {
  intro: "",
  needsStart: false,
  stops: [],
  answers: [],
  memoryProposals: [],
};
