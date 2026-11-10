import { tool } from "ai";
import { normaliseTag } from "../draw/rules";
import type { PlaceResult } from "../connector/place";
import { CONNECTOR_DEFAULTS, type ConnectorOptions } from "../connector/policy";
import type { PlaceRow } from "../connector/present";
import {
  drawOmikuji,
  getPlace,
  searchPlaces,
  suggestWalk,
  whyStop,
  type ToolResult,
} from "../connector/tools";
import type { ConnectorData, PlaceBundle, ToolContext, WalkResult } from "../connector/types";
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
//   - it forces the page's language and applies the story policy: a member's story reaches the model
//     only when its writer ticked the box that lets AI read it (src/lib/connector/policy.ts);
//   - it merges the visitor's hard rules and tastes into the draw, so a rule on their device applies
//     whatever the model remembers to pass;
//   - it writes down what came back (the ledger), so the model's answer can be checked against it;
//   - it adds an id to every quotable passage, so the model can point at a quote without retyping it.

/**
 * The planner's model is a third-party AI service, so it gets exactly what the connector's
 * assistants get: member stories only from writers who ticked the box. The person asking still
 * sees every story under the stop it belongs to, attached by code (resolve.ts), never by the model.
 */
export const PLANNER_OPTIONS: ConnectorOptions = CONNECTOR_DEFAULTS;

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

/**
 * The data the tools read, with the draws recorded and today's trip left out of them. A drawn stop's
 * page is read at once, by code, so the person can be shown the stories written there whether or not
 * the model ever opens it; the model's own `get_place` shares that read.
 */
export function recordingData(env: PlannerEnv, ledger: TurnLedger): ConnectorData {
  const exclude = env.memory.done.flatMap((entry) =>
    entry.slug === undefined ? [] : [entry.slug],
  );
  const reads = new Map<string, Promise<PlaceBundle | null>>();
  const read = (slug: string) => {
    let pending = reads.get(slug);
    if (pending === undefined) {
      pending = env.data.placeBundle(slug).then((bundle) => {
        if (bundle !== null) ledger.bundles.set(bundle.place.slug, bundle);
        return bundle;
      });
      reads.set(slug, pending);
    }
    return pending;
  };
  return {
    listPlaces: () => env.data.listPlaces(),
    listSets: () => env.data.listSets(),
    placeBundle: read,
    async walk(request) {
      const sent = exclude.length > 0 ? { ...request, exclude } : request;
      const result = await env.data.walk(sent);
      if (result.ok) {
        ledger.walks.push({ request: sent, result });
        // A page that cannot be read leaves that stop without stories; it never fails the walk.
        for (const stop of result.stops) {
          ledger.pending.push(
            read(stop.slug).then(
              () => undefined,
              () => undefined,
            ),
          );
        }
      }
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
        "Get one place as its Noren page shows it to an AI: names, public posts Noren found, the story Noren's AI stitched, the owner's own words, " +
        "and the stories of members who allowed AI to read them (each passage has a quoteId). Stories of other members are held back and only counted: " +
        "the page shows them to the person itself, so never say nobody has written about a place that has held-back stories. Quote only by quoteId. " +
        "Call it for each stop of a walk, in the same step, so you can attach what you may quote to that stop.",
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
        // This call's own draw, so the reasons below are worked out from the right one.
        let drawn: Extract<WalkResult, { ok: true }> | undefined;
        const tapped: ToolContext = {
          ...ctx,
          data: {
            ...ctx.data,
            walk: async (request) => {
              const result = await ctx.data.walk(request);
              if (result.ok) drawn = result;
              return result;
            },
          },
        };
        const { outcome } = await run(context, "suggest_walk", () =>
          suggestWalk.run(
            {
              ...input,
              ...fromPage,
              language,
              avoid: mergeTags(env.memory.avoid, input.avoid),
              interests: mergeTags(input.interests ?? [], env.memory.interests),
            },
            tapped,
          ),
        );
        if (!outcome.ok) return asError(outcome.message);
        const result = outcome.result as {
          stops: (PlaceRow & {
            wildCard: boolean;
            why: string;
            walkFromPrevious: { minutes: number };
          })[];
          notes?: string[];
        } & Record<string, unknown>;
        ledger.addPlaces(result.stops);
        // The page shows the rules and which interests matched, from the draw's own record. The
        // model never needs them, and the visitor's saved rules (diet, allergies, mobility, budget)
        // are sensitive, so they stay out of what the model reads.
        const { rules, interestsNotMatched, ...visible } = result;
        void rules;
        void interestsNotMatched;
        // A stop's reason names interests, and the draw also leaned on the visitor's saved likes.
        // The model hears only the interests it passed this turn, which the person just said.
        const said = new Set((input.interests ?? []).map(normaliseTag));
        const matched = new Map(
          (drawn?.stops ?? []).map((stop) => [
            stop.slug,
            stop.matchedInterests.filter((tag) => said.has(normaliseTag(tag))),
          ]),
        );
        const stops = result.stops.map((stop) => ({
          ...stop,
          why: whyStop(
            { wildCard: stop.wildCard, matchedInterests: matched.get(stop.slug) ?? [] },
            said.size > 0,
          ),
        }));
        // The model writes a logistics line from these three numbers and no others.
        return {
          ...visible,
          stops,
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
