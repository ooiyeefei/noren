"use node";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import { v } from "convex/values";
import { createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig, reportMode, toolStep } from "../src/lib/ai/config";
import {
  interpretationFields,
  interpretationReply,
  interpretTrip,
  plainInterpretation,
  validInterpretationRequest,
  type TripInterpretation,
} from "../src/lib/trip/interpret";
import { isoWeekday, localDay, recentSuggestions } from "../src/lib/draw/time";
import { getRegionConfig } from "../src/lib/region/registry";
import { anchorsFor, planTrip, type Candidate, type Plan } from "../src/lib/trip";
import { parseTripRequest } from "../src/lib/trip/request";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { appError } from "./lib/errors";
import { isRegionOn } from "./lib/region";
import { tripStopDetails, type TripStopDetails } from "./lib/tripStops";

// Use the generated runtime references while the orchestrator owns post-wave codegen.
const { trips } = internal as unknown as FilterApi<
  ApiFromModules<{ trips: typeof import("./trips") }>,
  FunctionReference<"query" | "mutation", "internal">
>;

type TripPlanReply = { plan: Plan; seed: string; stops: (TripStopDetails | null)[] };

export const plan = action({
  args: { request: v.any(), seed: v.optional(v.string()) },
  returns: v.object({
    plan: v.any(),
    seed: v.string(),
    stops: v.array(v.union(tripStopDetails, v.null())),
  }),
  handler: async (ctx, { request: input, seed: requestedSeed }): Promise<TripPlanReply> => {
    await ctx.runMutation(trips.begin, { kind: "plan" });
    const regionId = typeof input?.regionId === "string" ? input.regionId : "";
    const region = getRegionConfig(regionId);
    if (!region) throw appError("invalid_input", "invalid trip region");
    if (!isRegionOn(regionId)) throw appError("not_found", "Not found");
    const parsed = parseTripRequest(input, region);
    if (!parsed.ok) throw appError("invalid_input", parsed.code);
    if (requestedSeed !== undefined && (requestedSeed.length === 0 || requestedSeed.length > 128)) {
      throw appError("invalid_input", "invalid trip seed");
    }

    const { request } = parsed;
    const seed = requestedSeed ?? crypto.randomUUID();
    const now = Date.now();
    try {
      const anchors = anchorsFor(request, region);
      const groups: Id<"place">[][] = [];
      for (const anchor of anchors) {
        groups.push(await ctx.runQuery(trips.candidatePlaces, { regionId, anchor }));
      }
      const ids = [...new Set(groups.flat())];
      const byId = new Map<string, Candidate>();
      if (ids.length > 0) {
        const exposure = await ctx.runQuery(trips.candidateExposure, { regionId, now });
        const thisWeek = new Map(exposure.thisWeek.map(({ placeId, count }) => [placeId, count]));
        const lastWeek = new Map(exposure.lastWeek.map(({ placeId, count }) => [placeId, count]));
        const weekday = isoWeekday(now, region.collection.utcOffsetHours);
        // A place's fact reports can each read a person or source. Keep those reads
        // in small transactions and load a place only once across overlapping anchors.
        const batchSize = 50;
        for (let from = 0; from < ids.length; from += batchSize) {
          const rows = await ctx.runQuery(trips.candidates, {
            regionId,
            placeIds: ids.slice(from, from + batchSize),
          });
          for (const row of rows) {
            const { placeId } = row;
            byId.set(placeId, {
              ...row,
              recentSuggestions: recentSuggestions(
                { thisWeek: thisWeek.get(placeId) ?? 0, lastWeek: lastWeek.get(placeId) ?? 0 },
                weekday,
              ),
            });
          }
        }
      }
      const keyOf = ({ lat, lng }: { lat: number; lng: number }, metres: number) =>
        `${lat}:${lng}:${metres}`;
      const byAnchor = new Map(
        anchors.map(({ near, withinMetres }, index) => [
          keyOf(near, withinMetres),
          (groups[index] ?? []).flatMap((id) => {
            const candidate = byId.get(id);
            return candidate === undefined ? [] : [candidate];
          }),
        ]),
      );
      const plan = planTrip(request, {
        region,
        candidates: (near, withinMetres) => byAnchor.get(keyOf(near, withinMetres)) ?? [],
        seed,
        today: localDay(now, region.collection.utcOffsetHours),
      });
      const pins = new Map(request.pins.map((pin) => [pin.id, pin.placeId]));
      for (const op of request.ops ?? []) {
        if (op.op === "add_pin") pins.set(op.pin.id, op.pin.placeId);
      }
      const placeIds = [
        ...new Set(
          plan.days.flatMap(({ items }) =>
            items.flatMap((item) => {
              if (item.kind !== "stop") return [];
              const id = "placeId" in item.place ? item.place.placeId : pins.get(item.place.pinId);
              return id === undefined ? [] : [id];
            }),
          ),
        ),
      ];
      const stops = await ctx.runQuery(trips.stopDetails, { placeIds });
      return { plan, seed, stops };
    } catch {
      // Engine and database errors must not echo request or party data.
      throw appError("conflict", "the trip could not be planned");
    }
  },
});

export const interpret = action({
  args: interpretationFields,
  returns: interpretationReply,
  handler: async (ctx, request): Promise<TripInterpretation> => {
    await ctx.runMutation(trips.begin, { kind: "interpret" });
    const config = aiConfig("plan", process.env);
    if (!config.ok) throw appError("conflict", "trip interpretation is unavailable");
    if (!validInterpretationRequest(request))
      throw appError("invalid_input", "invalid trip messages");
    try {
      return await interpretTrip(request, {
        model: createLanguageModel(config.config),
        mode: reportMode(config.config),
        ...toolStep(config.config, 8000),
      });
    } catch {
      return plainInterpretation();
    }
  },
});
