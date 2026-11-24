import { v, type Infer } from "convex/values";
import { isPostcardCode, newPostcardCode, tidyLine, lengthOf } from "../src/lib/postcard/rules";
import { TRIP_RULES, isRuleTag } from "../src/lib/trip/vocabulary";
import { query, type QueryCtx } from "./_generated/server";
import { appError } from "./lib/errors";
import { mutation } from "./lib/gate";
import { isPublicRealPlace } from "./lib/publicPool";
import { consumeRateLimit } from "./lib/rateLimit";
import { enabledRegionIds, homeRegion, isRegionOn, regionConfig, tripSwitch } from "./lib/region";
import { readTripStops, tripStopDetails, type TripStopDetails } from "./lib/tripStops";
import { sharedTripDay } from "./tables/trip";
import { requireTrip } from "./trips";

const LINKS_PER_DAY = 20;
const LINKS_KEPT = 50;
const DAY_MS = 86_400_000;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const POINT = /^[a-z0-9][a-z0-9-]{0,79}$/;

type SharedDay = Infer<typeof sharedTripDay>;

function invalidShare(): never {
  throw appError("invalid_input", "invalid trip share");
}

function shareDays(ctx: QueryCtx, days: SharedDay[]): SharedDay[] {
  if (days.length > 7) invalidShare();
  return days.map((day) => {
    if (
      !Number.isInteger(day.index) ||
      day.index < 1 ||
      day.index > 7 ||
      (day.date !== undefined && !DATE.test(day.date)) ||
      (day.night !== undefined && !POINT.test(day.night)) ||
      day.items.length > 12
    )
      invalidShare();

    const items = day.items.map((item) => {
      if (!Number.isFinite(item.minutes) || item.minutes < 0) invalidShare();
      if (item.kind === "drive") {
        if (
          !POINT.test(item.from) ||
          !POINT.test(item.to) ||
          !Number.isFinite(item.kilometres) ||
          item.kilometres < 0
        )
          invalidShare();
        return item;
      }
      if (!TIME.test(item.at)) invalidShare();
      if (item.kind === "rest") return item;
      if (
        item.checks.length > TRIP_RULES.length ||
        item.checks.some(({ rule }) => !isRuleTag(rule)) ||
        ("placeId" in item && !ctx.db.normalizeId("place", item.placeId)) ||
        item.checks.some(
          (check) =>
            check.verdict === "met" &&
            check.restsOn.factId !== undefined &&
            !ctx.db.normalizeId("placeFact", check.restsOn.factId),
        )
      )
        invalidShare();
      const turnLabel = item.turnLabel === undefined ? undefined : tidyLine(item.turnLabel);
      const pinLabel = "pinLabel" in item ? tidyLine(item.pinLabel) : undefined;
      if (
        (turnLabel !== undefined && lengthOf(turnLabel) > 40) ||
        (pinLabel !== undefined && lengthOf(pinLabel) > 80)
      )
        invalidShare();
      return "placeId" in item
        ? { ...item, turnLabel }
        : { ...item, turnLabel, pinLabel: pinLabel ?? "" };
    });
    return { ...day, items };
  });
}

function stopIds(days: SharedDay[]): string[] {
  return [
    ...new Set(
      days.flatMap(({ items }) =>
        items.flatMap((item) => (item.kind === "stop" && "placeId" in item ? [item.placeId] : [])),
      ),
    ),
  ];
}

type SharedItem = SharedDay["items"][number];

function publicShareItems(
  items: SharedItem[],
  stops: ReadonlyMap<string, TripStopDetails>,
  region: ReturnType<typeof regionConfig>,
) {
  return items.flatMap((item): SharedItem[] => {
    if (item.kind !== "stop") return [item];
    const stop = "placeId" in item ? stops.get(item.placeId) : undefined;
    if ("placeId" in item && !stop) return [];
    return [
      {
        ...item,
        checks: item.checks.map((check) => {
          if (check.verdict === "not_known") return check;
          const { factId, kind } = check.restsOn;
          const fact = stop?.facts.find((fact) => fact.factId === factId && fact.basis === kind);
          const definition = region.factVocabulary?.find(({ key }) => key === fact?.key);
          const supported = fact?.value === "yes" ? definition?.meets : definition?.noMeets;
          return supported?.includes(check.rule)
            ? check
            : { rule: check.rule, verdict: "not_known", reason: "no_record" };
        }),
      },
    ];
  });
}

async function linkByCode(ctx: QueryCtx, code: string) {
  return ctx.db
    .query("tripShare")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
}

export const create = mutation({
  args: { deviceTripId: v.string(), title: v.string(), days: v.array(sharedTripDay) },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, { deviceTripId, title: rawTitle, days: rawDays }) => {
    const person = await requireTrip(ctx);
    const title = tidyLine(rawTitle);
    if (deviceTripId.length === 0 || deviceTripId.length > 128 || lengthOf(title) > 80)
      invalidShare();
    const days = shareDays(ctx, rawDays);
    const kept = await ctx.db
      .query("tripShare")
      .withIndex("by_ownerPersonId", (q) => q.eq("ownerPersonId", person._id))
      .take(LINKS_KEPT + 1);
    const previous = kept.find((link) => link.deviceTripId === deviceTripId);
    if (previous && !isRegionOn(previous.regionId)) throw appError("not_found", "Not found");
    if (previous === undefined && kept.length >= LINKS_KEPT)
      throw appError("conflict", "remove an old trip link before making another");

    const limit = await consumeRateLimit(ctx, {
      key: `trip:share:day:${person._id}`,
      limit: LINKS_PER_DAY,
      windowMs: DAY_MS,
      now: Date.now(),
    });
    if (!limit.ok) throw appError("rate_limited", "too many trip links today");

    // A public stop identifies the area. A plan of only custom pins can use the sole trip area.
    const tripRegions = enabledRegionIds().filter((id) => regionConfig(id).trip !== undefined);
    let firstPublicRegion: string | undefined;
    for (const placeId of stopIds(days)) {
      const id = ctx.db.normalizeId("place", placeId);
      const place = id === null ? null : await ctx.db.get("place", id);
      if (place && !isRegionOn(place.regionId)) throw appError("not_found", "Not found");
      if (place && isPublicRealPlace(place) && firstPublicRegion === undefined) {
        firstPublicRegion = place.regionId;
      }
    }

    const regionId =
      firstPublicRegion ??
      previous?.regionId ??
      (tripRegions.length === 1 ? tripRegions[0]! : homeRegion().id);
    if (!isRegionOn(regionId)) throw appError("not_found", "Not found");

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newPostcardCode();
      if (await linkByCode(ctx, code)) continue;
      const link = { code, ownerPersonId: person._id, regionId, title, days, deviceTripId };
      if (previous) await ctx.db.replace("tripShare", previous._id, link);
      else await ctx.db.insert("tripShare", link);
      return { code };
    }
    throw appError("conflict", "could not make a trip link");
  },
});

export const read = query({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      regionId: v.string(),
      title: v.string(),
      days: v.array(sharedTripDay),
      stops: v.array(tripStopDetails),
    }),
  ),
  handler: async (ctx, { code }) => {
    if (tripSwitch() === "off" || !isPostcardCode(code)) return null;
    const link = await linkByCode(ctx, code);
    if (!link || !isRegionOn(link.regionId)) return null;
    const owner = await ctx.db.get("person", link.ownerPersonId);
    if (!owner || owner.tokenIdentifier === `deleted:${owner._id}`) return null;
    const stops = (await readTripStops(ctx, stopIds(link.days))).filter((stop) => stop !== null);
    const visible = new Map<string, TripStopDetails>(stops.map((stop) => [stop.placeId, stop]));
    const region = regionConfig(link.regionId);
    const days = link.days.map((day) => ({
      ...day,
      items: publicShareItems(day.items, visible, region),
    }));
    return { regionId: link.regionId, title: link.title, days, stops };
  },
});

export const remove = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, { code }) => {
    const person = await requireTrip(ctx);
    const link = isPostcardCode(code) ? await linkByCode(ctx, code) : null;
    if (link?.ownerPersonId !== person._id || !isRegionOn(link.regionId))
      throw appError("not_found", "Not found");
    await ctx.db.delete("tripShare", link._id);
    return null;
  },
});
