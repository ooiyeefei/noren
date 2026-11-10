import { z } from "zod";
import { fold, searchForms, searchWords } from "./text";
import { keyedUniform } from "../draw/rng";
import { localDay } from "../draw/time";
import { WALK_RADIUS_METRES } from "../draw/route";
import { buildPlace } from "./place";
import {
  neighbourhoodLabel,
  neighbourhoodOfPin,
  placeRow,
  resolveCategory,
  resolveNeighbourhood,
  displayName,
  type PlaceRow,
} from "./present";
import { ConnectorDataError, type ListedPlace, type ToolContext } from "./types";
import { collectionUrl, placeUrl, writeStoryUrl, type UrlLanguage } from "./urls";

// The Noren tools: one shared, read-only set over Noren's public data. They know nothing about MCP
// or any web framework, so the connector (src/app/api/mcp) and, later, an in-app trip planner can
// both run them. Each tool is a name, a description for the assistant, an input schema and a
// function from (input, context) to a result.

/**
 * What an assistant must do with Noren's answers. It is appended to every tool description and
 * sent as the server's instructions, because an assistant may read only one of the two.
 */
export const ASSISTANT_RULES =
  "How to use Noren's answers: credit each story's writer by name. Link to the Noren page (the url field) so people can read more and add their own story. " +
  "Label machine translations and AI-stitched stories exactly as the result labels them. " +
  "Do not add facts that are not in the returned text. " +
  "Noren has no ratings, scores or rankings, so never invent or imply any: the order of results is not a ranking.";

const LANGUAGE = z
  .enum(["en", "ja"])
  .optional()
  .describe("Language of the Noren page links. English by default.");

export type ToolResult = { ok: true; result: unknown } | { ok: false; message: string };
const fail = (message: string): ToolResult => ({ ok: false, message });
const done = (result: unknown): ToolResult => ({ ok: true, result });

export type ConnectorTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  /** For the assistant. Includes ASSISTANT_RULES. */
  description: string;
  inputSchema: S;
  run(input: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
};

function defineTool<S extends z.ZodObject>(tool: ConnectorTool<S>): ConnectorTool<S> {
  return { ...tool, description: `${tool.description} ${ASSISTANT_RULES}` };
}

/** Turns an error from the data layer into a message the assistant can pass on. */
function problem(error: unknown): ToolResult {
  if (error instanceof ConnectorDataError) {
    return fail(
      error.code === "rate_limited"
        ? "Noren is getting a lot of requests just now. Ask the person to try again in a minute."
        : error.message,
    );
  }
  throw error;
}

const categoryKeys = (ctx: ToolContext) =>
  (ctx.region.categories ?? []).map((c) => c.key).join(", ");
const neighbourhoodIds = (ctx: ToolContext) =>
  (ctx.region.neighbourhoods ?? []).map((n) => n.id).join(", ");

// ---------------------------------------------------------------------------------------------
// search_places

const searchInput = z.object({
  query: z
    .string()
    .max(100)
    .optional()
    .describe("Free text: a place name in English, Japanese or romaji, or words like 'coffee'."),
  category: z
    .string()
    .max(60)
    .optional()
    .describe(
      "A category: restaurant, cafe, bar, shop, music_shop, gallery, stay, bath, museum, attraction or other.",
    ),
  neighbourhood: z
    .string()
    .max(60)
    .optional()
    .describe("A neighbourhood id or name, such as shinchi, Dejima or 新地中華街."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("How many places to return. 10 by default."),
  language: LANGUAGE,
});

export const searchPlaces = defineTool({
  name: "search_places",
  title: "Search places",
  description:
    "Find places on Noren's map of Nagasaki by free text (English, Japanese or romaji), category and/or neighbourhood. " +
    "Returns a short list: each place's names in English and Japanese, category, neighbourhood, whether anyone has written a story there, " +
    "a 'Not yet confirmed' label for places listed from open data that no one has checked in person, and the Noren page link. " +
    "The list is in no particular order and is not a ranking. Use get_place for a place's full page.",
  inputSchema: searchInput,
  async run(input, ctx) {
    const language = input.language ?? "en";
    const query = input.query?.trim() ?? "";
    if (query === "" && input.category === undefined && input.neighbourhood === undefined) {
      return fail("Give at least one of: query, category, neighbourhood.");
    }
    let category: string | undefined;
    if (input.category !== undefined) {
      const key = resolveCategory(ctx.region, input.category);
      if (key === null)
        return fail(`Unknown category "${input.category}". Categories: ${categoryKeys(ctx)}.`);
      category = key;
    }
    let neighbourhood: string | undefined;
    if (input.neighbourhood !== undefined) {
      const id = resolveNeighbourhood(ctx.region, input.neighbourhood);
      if (id === null) {
        return fail(
          `Unknown neighbourhood "${input.neighbourhood}". Neighbourhood ids: ${neighbourhoodIds(ctx)}.`,
        );
      }
      neighbourhood = id;
    }

    let places: ListedPlace[];
    try {
      places = await ctx.data.listPlaces();
    } catch (error) {
      return problem(error);
    }

    const words = searchWords(query);
    const matches: { place: ListedPlace; neighbourhoodId: string | undefined; byName: boolean }[] =
      [];
    for (const place of places) {
      if (category !== undefined && place.category !== category) continue;
      const neighbourhoodId = neighbourhoodOfPin(ctx.region, place.pin);
      if (neighbourhood !== undefined && neighbourhoodId !== neighbourhood) continue;
      let byName = true;
      if (words.length > 0) {
        const nameForms = place.names.flatMap((name) => searchForms(name.value));
        const otherForms = [
          ...Object.values(
            ctx.region.categories?.find((c) => c.key === place.category)?.labels ?? {},
          ),
          ...Object.values(
            ctx.region.neighbourhoods?.find((n) => n.id === neighbourhoodId)?.names ?? {},
          ),
          place.category ?? "",
        ].map(fold);
        const inNames = words.every((word) => nameForms.some((form) => form.includes(word)));
        const inAny = words.every((word) =>
          [...nameForms, ...otherForms].some((form) => form.includes(word)),
        );
        if (!inAny) continue;
        byName = inNames;
      }
      matches.push({ place, neighbourhoodId, byName });
    }

    // Names that match come before matches on category or neighbourhood. Within each group the
    // order rotates by the day, so a long list does not always favour the same places. It never
    // looks at anything about a place beyond whether it matches.
    const day = localDay(ctx.now(), ctx.region.collection.utcOffsetHours);
    const seed = `${ctx.region.id}|${day}|search`;
    matches.sort(
      (a, b) =>
        Number(b.byName) - Number(a.byName) ||
        keyedUniform(seed, a.place.slug) - keyedUniform(seed, b.place.slug),
    );

    const limit = input.limit ?? 10;
    const shown = matches.slice(0, limit);
    return done({
      matching: matches.length,
      showing: shown.length,
      places: shown.map(({ place, neighbourhoodId }) =>
        placeRow(place, neighbourhoodId, { region: ctx.region, origin: ctx.origin, language }),
      ),
      ...(matches.length > shown.length
        ? {
            note: `${matches.length} places match and ${shown.length} are shown. Add a category, neighbourhood or more words to narrow it.`,
          }
        : {}),
      ...(matches.length === 0
        ? {
            note: "No places match. Try other words, a different spelling, or only a neighbourhood.",
          }
        : {}),
    });
  },
});

// ---------------------------------------------------------------------------------------------
// get_place

const getPlaceInput = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .describe("The place's slug, from search_places, suggest_walk or draw_omikuji."),
  language: LANGUAGE,
});

export const getPlace = defineTool({
  name: "get_place",
  title: "Get a place",
  description:
    "Get one place exactly as a signed-out visitor sees it on its Noren page: names, category, the cautions its owner confirmed, " +
    "stories members wrote (with the writer's name and the original language), the story Noren's AI stitched from public posts (labelled " +
    "'Stitched by Noren's AI' with numbered sources), public posts Noren found (a short quote, the author's public name and a link to the original), " +
    "photo credits and the page link. A member's story is included only when its writer has allowed Noren to share it with AI assistants; " +
    "otherwise you get a count and a link, 'Read the member stories on Noren'. Never paraphrase a story you were not given.",
  inputSchema: getPlaceInput,
  async run(input, ctx) {
    const language = input.language ?? "en";
    try {
      const bundle = await ctx.data.placeBundle(input.slug);
      if (bundle === null) {
        return fail(
          `No public place has the slug "${input.slug}". Use search_places to find the slug.`,
        );
      }
      return done(buildPlace(bundle, ctx, language));
    } catch (error) {
      return problem(error);
    }
  },
});

// ---------------------------------------------------------------------------------------------
// list_collections

export const listCollections = defineTool({
  name: "list_collections",
  title: "List stamp collections",
  description:
    "List Noren's public stamp collections: neighbourhood sets such as Shinchi and Shimabara Castle Town. " +
    "Each has a name in English and Japanese, the places in it, and page links. It shows no one's personal progress.",
  inputSchema: z.object({ language: LANGUAGE }),
  async run(input, ctx) {
    const language: UrlLanguage = input.language ?? "en";
    try {
      const [sets, listed] = await Promise.all([ctx.data.listSets(), ctx.data.listPlaces()]);
      // Only places the map itself lists, so a place that was taken off the map is not offered here.
      const onMap = new Map(listed.map((place) => [place.slug, place]));
      return done({
        collections: sets.map(({ set, detail }) => ({
          id: set.neighbourhoodId,
          name: {
            en: set.names.en ?? set.neighbourhoodId,
            ja: set.names.ja ?? set.names.en ?? set.neighbourhoodId,
          },
          url: collectionUrl(ctx.origin, language, set.neighbourhoodId),
          places: (detail?.panels ?? [])
            .flatMap((panel) => panel.places)
            .flatMap((entry): PlaceRow[] => {
              const place = onMap.get(entry.slug);
              return place === undefined
                ? []
                : [
                    placeRow(place, neighbourhoodOfPin(ctx.region, place.pin), {
                      region: ctx.region,
                      origin: ctx.origin,
                      language,
                    }),
                  ];
            }),
        })),
      });
    } catch (error) {
      return problem(error);
    }
  },
});

// ---------------------------------------------------------------------------------------------
// suggest_walk

const walkInput = z.object({
  neighbourhood: z
    .string()
    .max(60)
    .optional()
    .describe(
      "Start from a neighbourhood: its id or name, such as suwa, Shinchi or 出島. Give this or startPlace.",
    ),
  startPlace: z
    .string()
    .max(120)
    .optional()
    .describe(
      "Start from a place: its slug or its name. Give this or neighbourhood. Never send coordinates.",
    ),
  stops: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("How many stops, 1 to 5. 3 by default."),
  avoid: z
    .array(z.string().max(40))
    .max(10)
    .optional()
    .describe(
      "Hard rules, as short tags such as vegetarian, no-alcohol, step-free, cash-free. Noren applies only those it can check from its own data and says which it could not check.",
    ),
  interests: z
    .array(z.string().max(40))
    .max(10)
    .optional()
    .describe(
      "Things the person likes, such as history, nature, food, craft, coffee. They tilt the odds and never exclude a place.",
    ),
  adventurousness: z
    .enum(["familiar", "mixed", "surprise"])
    .optional()
    .describe(
      "familiar: no wild cards. mixed: about a third are wild cards. surprise: about two thirds are. 'mixed' by default.",
    ),
  language: LANGUAGE,
});

export const WILD_CARD_WHY = "Wild card — not picked for you";

/** Why a stop is on the walk, in plain words. It never says the stop is good or best. */
export function whyStop(
  stop: { wildCard: boolean; matchedInterests: string[] },
  hadInterests: boolean,
): string {
  if (stop.wildCard) return WILD_CARD_WHY;
  if (stop.matchedInterests.length > 0) {
    return `Matches your interest in ${stop.matchedInterests.join(" and ")}`;
  }
  return hadInterests
    ? "Drawn at random from places near the start. It does not match your interests, which only tilt the odds"
    : "Drawn at random from places near the start";
}

/** A start given as text: a place's slug, or its name when that names exactly one place. */
function findStartPlace(
  places: ListedPlace[],
  text: string,
  ctx: ToolContext,
): ListedPlace | ToolResult {
  const bySlug = places.find((place) => place.slug === text);
  if (bySlug !== undefined) return bySlug;
  const wanted = fold(text);
  const exact = places.filter((place) => place.names.some((name) => fold(name.value) === wanted));
  const partial = places.filter((place) =>
    place.names.some((name) => fold(name.value).includes(wanted)),
  );
  const found = exact.length > 0 ? exact : partial;
  if (found.length === 1) return found[0]!;
  if (found.length === 0)
    return fail(`No public place is called "${text}". Use search_places to find it.`);
  const options = found
    .slice(0, 5)
    .map((place) => `${displayName(place, ctx.region)} [slug: ${place.slug}]`)
    .join("; ");
  return fail(
    `"${text}" could mean several places: ${options}. Ask which one, then call again with its slug as startPlace.`,
  );
}

export const suggestWalk = defineTool({
  name: "suggest_walk",
  title: "Suggest a walk",
  description:
    "Suggest a short walk of 1 to 5 stops, starting from a neighbourhood or a place. Never send coordinates: Noren does not take a person's location. " +
    "The stops are a fair random draw, not a ranking. 'avoid' tags are hard rules, but only those Noren can check from its own data are applied; " +
    "the result says which it could not check, so tell the person plainly. 'interests' only tilt the odds. 'adventurousness' sets how many stops are wild cards. " +
    "Each stop says why it is there. Stops come in walking order with the estimated walk between them, worked out from straight-line distance and not a street route. " +
    "Each call is a new draw, so call it again for a different walk.",
  inputSchema: walkInput,
  async run(input, ctx) {
    const language: UrlLanguage = input.language ?? "en";
    if ((input.neighbourhood === undefined) === (input.startPlace === undefined)) {
      return fail("Give exactly one of: neighbourhood or startPlace.");
    }
    let start: Parameters<ToolContext["data"]["walk"]>[0]["start"];
    try {
      if (input.neighbourhood !== undefined) {
        const id = resolveNeighbourhood(ctx.region, input.neighbourhood);
        if (id === null) {
          return fail(
            `Unknown neighbourhood "${input.neighbourhood}". Neighbourhood ids: ${neighbourhoodIds(ctx)}.`,
          );
        }
        start = { kind: "neighbourhood", id };
      } else {
        const found = findStartPlace(await ctx.data.listPlaces(), input.startPlace!, ctx);
        if ("ok" in found) return found;
        start = { kind: "place", slug: found.slug };
      }
      const interests = input.interests ?? [];
      const result = await ctx.data.walk({
        start,
        count: input.stops ?? 3,
        avoid: input.avoid ?? [],
        interests,
        adventurousness: input.adventurousness ?? "mixed",
      });
      if (!result.ok) {
        return fail(
          result.reason === "unknown_place"
            ? "That place is not on Noren's public map, so a walk cannot start there."
            : `Unknown neighbourhood. Neighbourhood ids: ${neighbourhoodIds(ctx)}.`,
        );
      }
      const startNames = result.start.names;
      const startName =
        result.start.kind === "place"
          ? displayName({ names: startNames }, ctx.region)
          : (() => {
              const label = neighbourhoodLabel(ctx.region, result.start.neighbourhoodId);
              return label === null ? "" : `${label.en} (${label.ja})`;
            })();
      let from = "the start";
      return done({
        start: {
          kind: result.start.kind,
          name: startName,
          ...(result.start.slug === undefined
            ? {}
            : { url: placeUrl(ctx.origin, language, result.start.slug) }),
        },
        stops: result.stops.map((stop) => {
          const row = placeRow({ ...stop, isMock: false }, stop.neighbourhoodId, {
            region: ctx.region,
            origin: ctx.origin,
            language,
          });
          const entry = {
            ...row,
            why: whyStop(stop, interests.length > 0),
            wildCard: stop.wildCard,
            walkFromPrevious: {
              from,
              minutes: stop.leg.minutes,
              metres: stop.leg.metres,
            },
          };
          from = row.name;
          return entry;
        }),
        rules: {
          applied: result.rulesApplied.map((rule) => ({
            tag: rule.tag,
            what: `Noren ${rule.checks}.`,
            limit: `${rule.limit}.`,
          })),
          notChecked: result.rulesNotChecked.map((rule) => ({
            tag: rule.tag,
            why: rule.reason,
          })),
        },
        ...(result.interestsNotMatched.length > 0
          ? { interestsNotMatched: result.interestsNotMatched }
          : {}),
        notes: [
          "Stops are drawn at random from real places within about " +
            `${(WALK_RADIUS_METRES / 1000).toFixed(1)} km of the start. Noren does not rank places, and a stop is not a recommendation.`,
          "Times and distances are estimates from straight-line distance at a walking pace, not a street route.",
          ...(result.stops.length < (input.stops ?? 3)
            ? [
                `Only ${result.stops.length} place${result.stops.length === 1 ? "" : "s"} near the start fit, so the walk is shorter than asked.`,
              ]
            : []),
          ...(result.rulesNotChecked.length > 0
            ? ["Tell the person which rules Noren could not check (see rules.notChecked)."]
            : []),
        ],
      });
    } catch (error) {
      return problem(error);
    }
  },
});

// ---------------------------------------------------------------------------------------------
// draw_omikuji

const omikujiInput = z.object({
  neighbourhood: z
    .string()
    .max(60)
    .optional()
    .describe(
      "A neighbourhood id or name. Everyone asking for the same neighbourhood on the same day gets the same slip.",
    ),
  language: LANGUAGE,
});

export const SLIP_NO_STORY = {
  en: "Nobody has written about this one yet. Go in and be the first.",
  ja: "ここについて、まだ誰も書いていません。入って、最初の一人になりましょう。",
};
export const SLIP_HAS_STORY = {
  en: "People have written about this place. Read what they said, then go and see it for yourself.",
  ja: "ここについては、すでに書いてくれた人がいます。読んでから、自分の目で確かめに行きましょう。",
};

export const drawOmikuji = defineTool({
  name: "draw_omikuji",
  title: "Draw today's omikuji",
  description:
    "Draw today's omikuji (おみくじ), a fortune slip like the paper ones at Suwa Shrine. It names one place. " +
    "The pick is fixed by today's date in Japan and the neighbourhood, so everyone who asks for the same neighbourhood on the same day gets the same slip. " +
    "It leans toward places nobody has written a story about yet, and says so, with a link to write the first story. " +
    "The slip text comes from a template in English and Japanese, not from AI: read it out as written. The slip is not a prediction and not a rating.",
  inputSchema: omikujiInput,
  async run(input, ctx) {
    const language: UrlLanguage = input.language ?? "en";
    let neighbourhoodId: string | undefined;
    if (input.neighbourhood !== undefined) {
      const id = resolveNeighbourhood(ctx.region, input.neighbourhood);
      if (id === null) {
        return fail(
          `Unknown neighbourhood "${input.neighbourhood}". Neighbourhood ids: ${neighbourhoodIds(ctx)}.`,
        );
      }
      neighbourhoodId = id;
    }
    try {
      const result = await ctx.data.omikuji(
        neighbourhoodId === undefined ? {} : { neighbourhoodId },
      );
      if (!result.ok) {
        return fail(
          result.reason === "no_places"
            ? "Noren has no public places there to draw from yet."
            : `Unknown neighbourhood. Neighbourhood ids: ${neighbourhoodIds(ctx)}.`,
        );
      }
      const row = placeRow({ ...result.place, isMock: false }, result.place.neighbourhoodId, {
        region: ctx.region,
        origin: ctx.origin,
        language,
      });
      const area = neighbourhoodLabel(ctx.region, result.neighbourhoodId);
      return done({
        slip: {
          title: { en: "Today's omikuji", ja: "今日のおみくじ" },
          date: result.day,
          area: area ?? {
            id: null,
            en: ctx.region.name.en ?? ctx.region.id,
            ja: ctx.region.name.ja ?? ctx.region.id,
          },
          text: result.place.hasStory ? SLIP_HAS_STORY : SLIP_NO_STORY,
        },
        place: row,
        ...(result.place.hasStory
          ? {}
          : { writeTheFirstStory: writeStoryUrl(ctx.origin, language, result.place.slug) }),
        note: "The slip comes from a template, not from AI. It is the same for everyone who asks for this area today.",
      });
    } catch (error) {
      return problem(error);
    }
  },
});

export const CONNECTOR_TOOLS = [
  searchPlaces,
  getPlace,
  listCollections,
  suggestWalk,
  drawOmikuji,
] as const;
