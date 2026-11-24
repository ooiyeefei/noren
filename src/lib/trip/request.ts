import { z } from "zod";
import type { PartySnapshot, RegionTripSettings, TripRequest } from "./types";
import { isRuleTag, TRIP_TASTES } from "./vocabulary";

// Every size is bounded: this is checked on the server against whatever a client sends.
const id = z.string().min(1).max(80);
const key = z.string().regex(/^t[1-8]$/);
const day = z.int().min(1).max(7);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const minutes = z
  .int()
  .positive()
  .max(24 * 60);
const taste = z.string().refine((value) => TRIP_TASTES.some((t) => t.tag === value), "unknown_tag");
export const ruleSchema = z.string().refine(isRuleTag, "unknown_tag");

export const travellerSchema = z.strictObject({
  key,
  ageBand: z.enum(["baby", "toddler", "child", "teen", "adult", "older"]),
  rules: z.array(ruleSchema).max(8),
  likes: z.array(taste).max(8),
  skips: z.array(taste).max(4),
  rests: z.strictObject({ after: z.literal("lunch"), minutes }).optional(),
  days: z.array(day).max(7).optional(),
});

export const partySnapshotSchema = z
  .strictObject({
    travellers: z.array(travellerSchema).max(8, "too_many_travellers"),
    limits: z.strictObject({ stretchMinutes: minutes, dayDriveMinutes: minutes }),
    guessed: z.array(z.enum(["stretch", "dayDrive", "meals", "fullness"])).max(4),
    fullness: z.enum(["light", "steady", "full"]),
    meals: z.strictObject({ lunch: time, dinner: time }),
    needs: z
      .array(
        z.strictObject({
          kind: z.enum(["prayer", "work", "rest"]),
          at: time,
          minutes,
          who: z.array(key).max(8).optional(),
        }),
      )
      .max(12),
  })
  .refine(
    (p) => new Set(p.travellers.map((t) => t.key)).size === p.travellers.length,
    "duplicate_traveller",
  )
  .refine(
    (p) => p.needs.every((n) => n.who?.every((k) => p.travellers.some((t) => t.key === k)) ?? true),
    "unknown_traveller",
  );

export const pinSchema = z.strictObject({
  id,
  day,
  at: time.optional(),
  minutes,
  placeId: id.optional(),
  pin: z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
});

export const placeSchema = z.union([
  z.strictObject({ placeId: id, slug: id }),
  z.strictObject({ pinId: id }),
]);
export const becauseSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("turn"), for: key, likes: z.array(taste).max(8) }),
  z.strictObject({ kind: z.literal("paired"), for: key, with: id }),
  z.strictObject({ kind: z.literal("need"), need: z.enum(["meal", "prayer", "work", "rest"]) }),
  z.strictObject({ kind: z.literal("pin") }),
  z.strictObject({ kind: z.literal("wild") }),
]);
const keptStop = z.strictObject({
  slot: id,
  day,
  place: placeSchema,
  hold: z.enum(["time", "place"]),
  at: time,
  minutes,
  because: becauseSchema,
});

export const changeOpSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("lighten"), day }),
  z.strictObject({ op: z.enum(["quieter", "shorter_walks"]), day: day.optional() }),
  z.strictObject({ op: z.literal("more_for"), who: key, day: day.optional() }),
  z.strictObject({ op: z.enum(["skip", "redraw"]), slot: id }),
  z.strictObject({ op: z.literal("stay_longer"), slot: id, minutes }),
  z.strictObject({ op: z.literal("add_pin"), pin: pinSchema }),
  z.strictObject({ op: z.literal("move_night"), night: day, to: id }),
  z.strictObject({ op: z.literal("weather"), day, kind: z.enum(["rain", "heat"]) }),
]);

export const tripRequestSchema = z
  .strictObject({
    regionId: id,
    start: id,
    end: id,
    days: day,
    startDate: z.iso.date().optional(),
    nights: z.array(id).max(6).optional(),
    via: z.array(id).max(6).optional(),
    party: partySnapshotSchema,
    pins: z.array(pinSchema).max(12),
    keep: z.strictObject({ stops: z.array(keptStop).max(84) }).optional(),
    avoid: z.array(id).max(60).optional(),
    ops: z.array(changeOpSchema).max(20).optional(),
  })
  .refine((r) => !r.nights || r.nights.length === r.days - 1, "invalid_nights")
  .refine(
    (r) =>
      r.pins.every((p) => p.day <= r.days) &&
      r.keep?.stops.every((s) => s.day <= r.days) !== false &&
      r.ops?.every(
        (op) =>
          (!("day" in op) || (op.day ?? 1) <= r.days) &&
          (op.op !== "move_night" || op.night < r.days) &&
          (op.op !== "add_pin" || op.pin.day <= r.days),
      ) !== false,
    "invalid_day",
  );

export function parseTripRequest(
  input: unknown,
  region: RegionTripSettings,
): { ok: true; request: TripRequest } | { ok: false; code: string } {
  const parsed = tripRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const specific = [
      "too_many_travellers",
      "unknown_tag",
      "duplicate_traveller",
      "unknown_traveller",
      "invalid_nights",
      "invalid_day",
    ];
    return {
      ok: false,
      code: issue && specific.includes(issue.message) ? issue.message : "invalid_request",
    };
  }
  const request = parsed.data;
  const points = new Set(region.roads?.points.map((p) => p.id));
  const moved = request.ops?.flatMap((op) => (op.op === "move_night" ? [op.to] : [])) ?? [];
  if (
    [request.start, request.end, ...(request.nights ?? []), ...(request.via ?? []), ...moved].some(
      (p) => !points.has(p),
    )
  ) {
    return { ok: false, code: "unknown_road_point" };
  }
  return { ok: true, request };
}

type PartySettings = {
  travellers?: PartySnapshot["travellers"];
  limits?: Partial<PartySnapshot["limits"]>;
  meals?: Partial<PartySnapshot["meals"]>;
  fullness?: PartySnapshot["fullness"];
  needs?: PartySnapshot["needs"];
};

export function fillGuesses(party: PartySettings, region: RegionTripSettings): PartySnapshot {
  const defaults = region.trip?.guesses;
  if (!defaults) throw new Error("missing_trip_settings");
  const guessed: PartySnapshot["guessed"] = [];
  if (party.limits?.stretchMinutes === undefined) guessed.push("stretch");
  if (party.limits?.dayDriveMinutes === undefined) guessed.push("dayDrive");
  if (!party.meals?.lunch || !party.meals?.dinner) guessed.push("meals");
  if (!party.fullness) guessed.push("fullness");
  return partySnapshotSchema.parse({
    travellers: (party.travellers ?? []).map(
      ({ key, ageBand, rules, likes, skips, rests, days }) => ({
        key,
        ageBand,
        rules,
        likes,
        skips,
        ...(rests && { rests }),
        ...(days && { days }),
      }),
    ),
    limits: {
      stretchMinutes: party.limits?.stretchMinutes ?? defaults.stretchMinutes,
      dayDriveMinutes: party.limits?.dayDriveMinutes ?? defaults.dayDriveMinutes,
    },
    meals: {
      lunch: party.meals?.lunch ?? defaults.lunch,
      dinner: party.meals?.dinner ?? defaults.dinner,
    },
    fullness: party.fullness ?? defaults.fullness,
    needs: party.needs ?? [],
    guessed,
  });
}
