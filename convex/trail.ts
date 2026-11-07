import { v } from "convex/values";
import { dayAt, dayToTime } from "../src/lib/collection/reach";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requirePerson } from "./lib/auth";
import { readMapNames, readMapPin } from "./lib/mapCopies";
import { regionConfig } from "./lib/region";
import { placePhotoRules, storyPhotoViews } from "./lib/storyPhotos";
import { scriptValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

// A person's trail: the places they hold a stamp for, each with their own moments there, so the
// client can draw them as footprints on a map. Like the stamp book it is worked out from what they
// already did, belongs to its owner alone and has no total. Nothing here takes a person as an
// argument and nothing returns another person's rows (principle I, FR-109).
//
// The rule for what earns a stamp is the one in stampBook.ts, and convex/trail.test.ts checks that the
// two agree.

/** Rows read from each activity table, newest first, as in the stamp book. */
const ROW_LIMIT = 500;
/** The newest stamped places a trail shows. */
const PLACE_LIMIT = 300;
/** The newest moments kept for one place. */
const MOMENT_LIMIT = 20;

const photoView = v.object({
  key: v.string(),
  width: v.number(),
  height: v.number(),
  waiting: v.boolean(),
});

/**
 * Every moment carries `at` (when, in ms), `day` (that date in the region's offset) and `timed`:
 * false when only the day is known. A check-in keeps only its day by design (FR-105), so its `at` is
 * midnight of that day and means nothing finer.
 */
const when = { at: v.number(), day: v.string(), timed: v.boolean() };
const momentView = v.union(
  v.object({
    kind: v.literal("story"),
    ...when,
    body: v.string(),
    lang: v.string(),
    photos: v.array(photoView),
  }),
  v.object({
    kind: v.literal("post"),
    ...when,
    url: v.string(),
    platform: v.string(),
    title: v.union(v.string(), v.null()),
    note: v.union(v.string(), v.null()),
    noteLang: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("check_in"),
    ...when,
    setNames: v.record(v.string(), v.string()),
    /** One-based, as a person reads it. */
    panel: v.number(),
  }),
  v.object({ kind: v.literal("still_here"), ...when }),
);

const placeView = v.object({
  placeId: v.id("place"),
  slug: v.string(),
  names: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  pin: v.object({ lat: v.number(), lng: v.number() }),
  /** The names of the neighbourhood the pin falls in, or null when it falls in none. */
  areaNames: v.union(v.record(v.string(), v.string()), v.null()),
  stampedAt: v.number(),
  /** The date of the stamp in the region's offset. */
  stampDay: v.string(),
  /**
   * The earliest time of day the person is known to have acted here on that date, or null when only
   * the day is known (a check-in). The client orders a day's places by it, day-only ones first.
   */
  stampTime: v.union(v.number(), v.null()),
  /** Newest first. */
  moments: v.array(momentView),
});

type Moment = typeof momentView.type;

/** One thing the person did, before it is shaped for the client. */
type Raw = { at: number; timed: boolean } & (
  | { kind: "still_here" }
  | { kind: "story"; story: Doc<"story"> }
  | { kind: "post"; source: Doc<"source"> }
  | { kind: "check_in"; setId: Id<"collectionSet">; panelIndex: number }
);

/** The caller's own stamped places with the pin and their moments, oldest stamp first. */
export const mine = query({
  args: {},
  returns: v.array(placeView),
  handler: async (ctx) => {
    const person = await requirePerson(ctx);
    const byPlace = new Map<Id<"place">, Raw[]>();
    const earliest = new Map<Id<"place">, number>();
    const note = (placeId: Id<"place">, raw: Raw) => {
      byPlace.set(placeId, [...(byPlace.get(placeId) ?? []), raw]);
      const seen = earliest.get(placeId);
      if (seen === undefined || raw.at < seen) earliest.set(placeId, raw.at);
    };

    const checks = await ctx.db
      .query("placeCheck")
      .withIndex("by_personId_and_verdict", (q) =>
        q.eq("personId", person._id).eq("verdict", "still_here"),
      )
      .order("desc")
      .take(ROW_LIMIT);
    for (const check of checks)
      note(check.placeId, { kind: "still_here", at: check._creationTime, timed: true });

    const stories = await ctx.db
      .query("story")
      .withIndex("by_authorPersonId", (q) => q.eq("authorPersonId", person._id))
      .order("desc")
      .take(ROW_LIMIT);
    for (const story of stories)
      if (story.status === "live")
        note(story.placeId, { kind: "story", at: story._creationTime, timed: true, story });

    const sources = await ctx.db
      .query("source")
      .withIndex("by_addedBy_and_origin", (q) =>
        q.eq("addedBy", person._id).eq("origin", undefined),
      )
      .order("desc")
      .take(ROW_LIMIT);
    for (const source of sources)
      if (source.status !== "hidden")
        note(source.placeId, { kind: "post", at: source._creationTime, timed: true, source });

    const collection = await ctx.db
      .query("personCollection")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .unique();
    for (const visit of collection?.visits ?? [])
      note(visit.placeId, {
        kind: "check_in",
        at: dayToTime(visit.day),
        timed: false,
        setId: visit.setId,
        panelIndex: visit.panelIndex,
      });

    const setNames = new Map<Id<"collectionSet">, Record<string, string>>();
    const newestFirst = [...earliest].sort(([, a], [, b]) => b - a).slice(0, PLACE_LIMIT);
    const trail = [];
    for (const [placeId, stampedAt] of newestFirst) {
      const place = await ctx.db.get("place", placeId);
      if (place === null || !(await canReadPlace(ctx, person, place))) continue;
      const pin = place.mapPin !== undefined ? place.mapPin : await readMapPin(ctx, placeId);
      // A place with no pin has nowhere to stand on a map. Its stamp stays in the book.
      if (pin === null) continue;
      const region = regionConfig(place.regionId);
      const hours = region.collection.utcOffsetHours;
      const all = byPlace.get(placeId) ?? [];
      const stampDay = dayAt(stampedAt, hours);
      const timedThatDay = all
        .filter((raw) => raw.timed && dayAt(raw.at, hours) === stampDay)
        .map((raw) => raw.at);
      const raws = [...all].sort((a, b) => b.at - a.at).slice(0, MOMENT_LIMIT);
      const photoRules = raws.some(({ kind }) => kind === "story")
        ? await placePhotoRules(ctx, person, place)
        : null;
      const moments: Moment[] = [];
      for (const raw of raws) {
        const w = { at: raw.at, day: dayAt(raw.at, hours), timed: raw.timed };
        if (raw.kind === "still_here") moments.push({ kind: "still_here", ...w });
        else if (raw.kind === "story") {
          const photos = photoRules
            ? await storyPhotoViews(ctx, raw.story._id, true, photoRules)
            : [];
          moments.push({
            kind: "story",
            ...w,
            body: raw.story.body,
            lang: raw.story.lang,
            photos: photos.map(({ key, width, height, waiting }) => ({
              key,
              width,
              height,
              waiting,
            })),
          });
        } else if (raw.kind === "post") {
          moments.push({
            kind: "post",
            ...w,
            url: raw.source.url,
            platform: raw.source.platform,
            title: raw.source.title ?? null,
            note: raw.source.creatorNote ?? null,
            noteLang: raw.source.noteLang ?? null,
          });
        } else {
          if (!setNames.has(raw.setId))
            setNames.set(raw.setId, (await ctx.db.get("collectionSet", raw.setId))?.names ?? {});
          moments.push({
            kind: "check_in",
            ...w,
            setNames: setNames.get(raw.setId) ?? {},
            panel: raw.panelIndex + 1,
          });
        }
      }
      const area = region.neighbourhoods?.find(({ id }) => id === place.neighbourhood);
      trail.push({
        placeId,
        slug: place.slug,
        names: place.mapNames ?? (await readMapNames(ctx, placeId)),
        pin,
        areaNames: area?.names ?? null,
        stampedAt,
        stampDay,
        stampTime: timedThatDay.length > 0 ? Math.min(...timedThatDay) : null,
        moments,
      });
    }
    return trail.sort((a, b) => a.stampedAt - b.stampedAt);
  },
});
