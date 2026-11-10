import { tool } from "ai";
import { normaliseTag } from "../draw/rules";
import type { PlaceResult } from "../connector/place";
import type { ConnectorOptions } from "../connector/policy";
import type { PlaceRow } from "../connector/present";
import {
  drawOmikuji,
  getPlace,
  searchPlaces,
  suggestWalk,
  type ToolResult,
} from "../connector/tools";
import type { ConnectorData, ToolContext } from "../connector/types";
import type { RegionConfig } from "../region/schema";
import {
  annotatePlace,
  MAX_OMIKUJI_DRAWS,
  MAX_PLACE_LOOKUPS,
  MAX_WALK_DRAWS,
  TurnLedger,
} from "./ledger";
import type { PlannerRequest } from "./request";

// The tools the planner's model may call: Noren's shared tools (src/lib/connector/tools.ts), wrapped.
// The wrapper does four things the model cannot be trusted with:
//   - it forces the page's language and gives the in-app planner its own story policy;
//   - it merges the visitor's hard rules and tastes into the draw, so a rule on their device applies
//     whatever the model remembers to pass;
//   - it writes down what came back (the ledger), so the model's answer can be checked against it;
//   - it adds an id to every quotable passage, so the model can point at a quote without retyping it.

/** The in-app planner shows stories on Noren itself, so every story the page shows may be used. */
export const PLANNER_OPTIONS: ConnectorOptions = { memberStories: "all-shown" };

export type PlannerEnv = {
  data: ConnectorData;
  region: RegionConfig;
  origin: string;
  now(): number;
  locale: "en" | "ja";
  memory: PlannerRequest["memory"];
  start?: PlannerRequest["start"];
};

const MAX_TAGS = 10;

/** The tags in the first list, then those in the second, once each. */
export function mergeTags(
  first: readonly string[],
  second: readonly string[] | undefined,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const raw of [...first, ...(second ?? [])]) {
    const tag = raw.trim();
    const key = normaliseTag(tag);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }
  return merged.slice(0, MAX_TAGS);
}

/** The data the tools read, with the draws recorded and today's trip left out of them. */
export function recordingData(env: PlannerEnv, ledger: TurnLedger): ConnectorData {
  const exclude = env.memory.done.flatMap((entry) =>
    entry.slug === undefined ? [] : [entry.slug],
  );
  return {
    listPlaces: () => env.data.listPlaces(),
    listSets: () => env.data.listSets(),
    async placeBundle(slug) {
      const bundle = await env.data.placeBundle(slug);
      if (bundle !== null) ledger.bundles.set(bundle.place.slug, bundle);
      return bundle;
    },
    async walk(request) {
      const sent = exclude.length > 0 ? { ...request, exclude } : request;
      const result = await env.data.walk(sent);
      if (result.ok) ledger.walks.push({ request: sent, result });
      return result;
    },
    async omikuji(request) {
      const result = await env.data.omikuji(request);
      if (result.ok) ledger.omikuji = result;
      return result;
    },
  };
}

export type PlannerToolContext = { ctx: ToolContext; env: PlannerEnv; ledger: TurnLedger };

export function plannerContext(env: PlannerEnv, ledger: TurnLedger): PlannerToolContext {
  return {
    env,
    ledger,
    ctx: {
      data: recordingData(env, ledger),
      region: env.region,
      origin: env.origin,
      options: PLANNER_OPTIONS,
      now: env.now,
    },
  };
}

/** A result for the model: the data, or a short message saying what went wrong. */
type ModelResult = unknown;

async function run(
  { ledger }: PlannerToolContext,
  name: string,
  work: () => Promise<ToolResult>,
): Promise<{ outcome: ToolResult }> {
  try {
    return { outcome: await work() };
  } catch (error) {
    // Name the error and nothing else: a message can carry what the person asked.
    ledger.dataFailed = true;
    console.error(
      `planner tool ${name} failed (${error instanceof Error ? error.name || "Error" : "NonError"})`,
    );
    return {
      outcome: {
        ok: false,
        message: "Noren could not read its data just now. Submit what you have.",
      },
    };
  }
}

const asError = (message: string): ModelResult => ({ error: message });

export function plannerTools(context: PlannerToolContext) {
  const { ctx, env, ledger } = context;
  const language = env.locale;

  return {
    search_places: tool({
      description:
        "Find places on Noren's map by free text (English, Japanese or romaji), category and/or neighbourhood. " +
        "Use it to find a place a question is about, then get_place for what people wrote there. " +
        "The list has no order that means anything and is not a ranking. Do not use it to pick stops: suggest_walk does that.",
      inputSchema: searchPlaces.inputSchema.omit({ language: true }),
      execute: async (input): Promise<ModelResult> => {
        const { outcome } = await run(context, "search_places", () =>
          searchPlaces.run({ ...input, language }, ctx),
        );
        if (!outcome.ok) return asError(outcome.message);
        const result = outcome.result as { places?: PlaceRow[] };
        ledger.addPlaces(result.places ?? []);
        ledger.searches++;
        return result;
      },
    }),

    get_place: tool({
      description:
        "Get one place as its Noren page shows it: names, what members wrote (each passage has a quoteId), public posts Noren found, " +
        "the story Noren's AI stitched, and the owner's own words. Quote only by quoteId. Call it for each stop of a walk, in the same step, " +
        "so you can attach what people wrote to that stop.",
      inputSchema: getPlace.inputSchema.omit({ language: true }),
      execute: async (input): Promise<ModelResult> => {
        if (ledger.lookups >= MAX_PLACE_LOOKUPS) {
          return asError("Enough places have been opened for one question. Submit what you have.");
        }
        ledger.lookups++;
        const { outcome } = await run(context, "get_place", () =>
          getPlace.run({ ...input, language }, ctx),
        );
        if (!outcome.ok) return asError(outcome.message);
        const result = outcome.result as PlaceResult;
        ledger.addPlaces([result.place]);
        ledger.searches++;
        return annotatePlace(result, ledger.bundles.get(result.place.slug), ledger);
      },
    }),

    suggest_walk: tool({
      description:
        "Draw a short walk of 1 to 5 stops. Noren draws the stops at random from real places near the start and puts them in walking order; " +
        "you cannot choose, rank or reorder them, and a call is a new draw (at most two a question). Pass only what the person said: " +
        "how many stops, interests, hard rules in 'avoid', how adventurous. Their saved rules and tastes are added for you. " +
        "Leave neighbourhood and startPlace out to start where the page says the person is starting; give one only if they named another start in this message.",
      inputSchema: suggestWalk.inputSchema.omit({ language: true }),
      execute: async (input): Promise<ModelResult> => {
        if (ledger.walkDraws >= MAX_WALK_DRAWS) {
          return asError("Two walks are enough for one question. Submit the one you have.");
        }
        const named = input.neighbourhood !== undefined || input.startPlace !== undefined;
        const start = env.start;
        const fromPage =
          !named && start !== undefined
            ? start.kind === "neighbourhood"
              ? { neighbourhood: start.id }
              : { startPlace: start.slug }
            : {};
        ledger.walkDraws++;
        const { outcome } = await run(context, "suggest_walk", () =>
          suggestWalk.run(
            {
              ...input,
              ...fromPage,
              language,
              avoid: mergeTags(env.memory.avoid, input.avoid),
              interests: mergeTags(input.interests ?? [], env.memory.interests),
            },
            ctx,
          ),
        );
        if (!outcome.ok) return asError(outcome.message);
        const result = outcome.result as {
          stops: (PlaceRow & { wildCard: boolean; walkFromPrevious: { minutes: number } })[];
          notes?: string[];
        } & Record<string, unknown>;
        ledger.addPlaces(result.stops);
        // The page shows the rules and which interests matched, from the draw's own record. The
        // model never needs them, and the visitor's saved rules (diet, allergies, mobility, budget)
        // are sensitive, so they stay out of what the model reads.
        const { rules, interestsNotMatched, ...visible } = result;
        void rules;
        void interestsNotMatched;
        // The model writes a logistics line from these three numbers and no others.
        return {
          ...visible,
          notes: (result.notes ?? []).filter((note) => !note.includes("rules.notChecked")),
          summary: {
            stops: result.stops.length,
            minutesOnFoot: result.stops.reduce(
              (sum, stop) => sum + stop.walkFromPrevious.minutes,
              0,
            ),
            wildCards: result.stops.filter((stop) => stop.wildCard).length,
          },
        };
      },
    }),

    draw_omikuji: tool({
      description:
        "Draw today's omikuji, a fortune slip that names one place. It is fixed by today's date in Japan and the neighbourhood. " +
        "Use it only when the person asks for one. The slip's words come from a template, not from you.",
      inputSchema: drawOmikuji.inputSchema.omit({ language: true }),
      execute: async (input): Promise<ModelResult> => {
        if (ledger.omikujiDraws >= MAX_OMIKUJI_DRAWS)
          return asError("One slip is enough for one question.");
        ledger.omikujiDraws++;
        const start = env.start;
        const fromPage =
          input.neighbourhood === undefined && start?.kind === "neighbourhood"
            ? { neighbourhood: start.id }
            : {};
        const { outcome } = await run(context, "draw_omikuji", () =>
          drawOmikuji.run({ ...input, ...fromPage, language }, ctx),
        );
        if (!outcome.ok) return asError(outcome.message);
        const result = outcome.result as { place?: PlaceRow };
        if (result.place) ledger.addPlaces([result.place]);
        return result;
      },
    }),
  };
}
