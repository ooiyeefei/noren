import { v } from "convex/values";
import { dayAt } from "../src/lib/collection/reach";
import { distanceMetres } from "../src/lib/overture/dedupe";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { checkablePlace, isPubliclyReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { liveStory } from "./lib/liveStory";
import { readMapNames, readMapPin } from "./lib/mapCopies";
import { regionConfig } from "./lib/region";
import { scriptValidator } from "./lib/validators";
import { canReadPlace, type Viewer } from "./lib/visibility";

// The neighbourhood noren collection (spec 002). Nothing here takes a person as an argument except
// through the verified token, and nothing returns another person's progress, so it can't become a
// comparison or a ranking (FR-108, principle I). A check-in sends only which place: the distance is
// worked out on the phone, and a coordinate never reaches this file (FR-105).

const SET_LIMIT = 50;
const PLACES_PER_PANEL = 3;
/** Places closer than this are flagged for a steward, because one spot could reach them both. */
const SPREAD_METRES = 50;
/** Public places read for a steward's swap list; the busiest neighbourhood holds about 300. */
const CANDIDATE_LIMIT = 1000;
/** People read for the two totals. Past this the totals say so instead of undercounting quietly. */
const TOTALS_LIMIT = 8000;

const names = v.record(v.string(), v.string());
const point = v.object({ lat: v.number(), lng: v.number() });
const placeNames = v.array(
  v.object({
    lang: v.string(),
    script: scriptValidator,
    value: v.string(),
    isPrimary: v.boolean(),
  }),
);
const line = v.object({ en: v.string(), ja: v.string(), postsRead: v.number() });

type Spot = Doc<"collectionSet">;

async function rowOf(ctx: QueryCtx, viewer: Viewer) {
  if (viewer === null) return null;
  return await ctx.db
    .query("personCollection")
    .withIndex("by_personId", (q) => q.eq("personId", viewer._id))
    .unique();
}

function dyedPanels(row: Doc<"personCollection"> | null, setId: Id<"collectionSet">) {
  const dyed = new Set<number>();
  for (const visit of row?.visits ?? []) if (visit.setId === setId) dyed.add(visit.panelIndex);
  return dyed;
}

function centerOf(set: Spot) {
  const region = regionConfig(set.regionId);
  const { lat, lng } =
    region.neighbourhoods?.find(({ id }) => id === set.neighbourhoodId)?.center ??
    region.defaultCenter;
  return { lat, lng };
}

async function panelsOf(ctx: QueryCtx, set: Spot) {
  return await ctx.db
    .query("collectionPanel")
    .withIndex("by_setId_and_index", (q) => q.eq("setId", set._id))
    .take(set.panelCount);
}

/** Each panel's art, sent only for a panel this person has dyed (FR-103). */
async function artFor(ctx: QueryCtx, set: Spot, dyed: Set<number>) {
  const panels = await panelsOf(ctx, set);
  return await Promise.all(
    panels.map(async (panel) => ({
      index: panel.index,
      dyed: dyed.has(panel.index),
      artUrl:
        dyed.has(panel.index) && panel.artId !== undefined
          ? await ctx.storage.getUrl(panel.artId)
          : null,
    })),
  );
}

/** A picked line if it is still live, otherwise the first live sentence (FR-116). */
async function lineFor(
  ctx: QueryCtx,
  viewer: Viewer,
  place: Doc<"place">,
  pickedLineEn: string | undefined,
) {
  const story = await liveStory(ctx, viewer, place);
  if (story === null) return null;
  const chosen =
    story.sentences.find(({ en }) => en === pickedLineEn) ?? story.sentences[0] ?? null;
  return chosen && { en: chosen.en, ja: chosen.ja, postsRead: story.postsRead };
}

async function pickedLineFor(
  ctx: QueryCtx,
  viewer: Viewer,
  place: Doc<"place">,
  pickedLineEn: string | undefined,
) {
  if (pickedLineEn === undefined) return null;
  const story = await liveStory(ctx, viewer, place);
  const chosen = story?.sentences.find(({ en }) => en === pickedLineEn);
  return story && chosen ? { en: chosen.en, ja: chosen.ja, postsRead: story.postsRead } : null;
}

/** The live sets, with this person's own progress. Signed out, nothing is dyed. */
export const book = query({
  args: { regionId: v.string() },
  returns: v.object({
    sets: v.array(
      v.object({
        id: v.id("collectionSet"),
        neighbourhoodId: v.string(),
        names,
        center: point,
        panelCount: v.number(),
        dyedCount: v.number(),
        panels: v.array(
          v.object({ index: v.number(), dyed: v.boolean(), artUrl: v.union(v.string(), v.null()) }),
        ),
      }),
    ),
    badges: v.array(
      v.object({
        setId: v.id("collectionSet"),
        names,
        wholeArtUrl: v.union(v.string(), v.null()),
        finishedOn: v.string(),
      }),
    ),
  }),
  handler: async (ctx, { regionId }) => {
    const viewer = await currentPerson(ctx);
    const row = await rowOf(ctx, viewer);
    const live = await ctx.db
      .query("collectionSet")
      .withIndex("by_regionId_and_status", (q) => q.eq("regionId", regionId).eq("status", "live"))
      .take(SET_LIMIT);
    const sets = [];
    for (const set of live) {
      const dyed = dyedPanels(row, set._id);
      sets.push({
        id: set._id,
        neighbourhoodId: set.neighbourhoodId,
        names: set.names,
        center: centerOf(set),
        panelCount: set.panelCount,
        dyedCount: dyed.size,
        panels: await artFor(ctx, set, dyed),
      });
    }
    const badges = await Promise.all(
      (row?.badges ?? []).map(async ({ setId, names: badgeNames, wholeArtId, finishedOn }) => ({
        setId,
        names: badgeNames,
        wholeArtUrl: wholeArtId === undefined ? null : await ctx.storage.getUrl(wholeArtId),
        finishedOn,
      })),
    );
    return { sets, badges };
  },
});

/**
 * One neighbourhood's set. A steward can open a draft to check it before it goes live. `lastVisited`
 * is where the next panel is measured from: it is the person's own, and it holds no time of day.
 */
export const set = query({
  args: { regionId: v.string(), neighbourhoodId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("collectionSet"),
      neighbourhoodId: v.string(),
      names,
      status: v.union(v.literal("draft"), v.literal("live")),
      panelCount: v.number(),
      center: point,
      finished: v.boolean(),
      finishedOn: v.union(v.string(), v.null()),
      wholeArtUrl: v.union(v.string(), v.null()),
      lastVisitedPlaceId: v.union(v.id("place"), v.null()),
      panels: v.array(
        v.object({
          index: v.number(),
          dyed: v.boolean(),
          artUrl: v.union(v.string(), v.null()),
          places: v.array(
            v.object({
              placeId: v.id("place"),
              slug: v.string(),
              names: placeNames,
              pin: v.union(point, v.null()),
              line: v.union(line, v.null()),
            }),
          ),
        }),
      ),
    }),
  ),
  handler: async (ctx, { regionId, neighbourhoodId }) => {
    const viewer = await currentPerson(ctx);
    const found = await ctx.db
      .query("collectionSet")
      .withIndex("by_regionId_and_neighbourhoodId", (q) =>
        q.eq("regionId", regionId).eq("neighbourhoodId", neighbourhoodId),
      )
      .unique();
    if (found === null || (found.status !== "live" && viewer?.role !== "steward")) return null;
    const row = await rowOf(ctx, viewer);
    const dyed = dyedPanels(row, found._id);
    const panels = [];
    for (const panel of await artFor(ctx, found, dyed)) {
      const entries = await ctx.db
        .query("collectionPlace")
        .withIndex("by_setId_and_panelIndex", (q) =>
          q.eq("setId", found._id).eq("panelIndex", panel.index),
        )
        .take(PLACES_PER_PANEL);
      const places = [];
      for (const entry of entries) {
        const place = await ctx.db.get("place", entry.placeId);
        // A panel may show no places for a moment while a steward replaces one.
        if (place === null || !(await canReadPlace(ctx, viewer, place))) continue;
        places.push({
          placeId: place._id,
          slug: place.slug,
          names: place.mapNames ?? (await readMapNames(ctx, place._id)),
          pin: place.mapPin ?? (await readMapPin(ctx, place._id)),
          line: await lineFor(ctx, viewer, place, entry.pickedLineEn),
        });
      }
      panels.push({ ...panel, places });
    }
    const badge = row?.badges.find(({ setId }) => setId === found._id);
    const visitsHere = row?.visits.filter(({ setId }) => setId === found._id) ?? [];
    return {
      id: found._id,
      neighbourhoodId: found.neighbourhoodId,
      names: found.names,
      status: found.status,
      panelCount: found.panelCount,
      center: centerOf(found),
      finished: badge !== undefined,
      finishedOn: badge?.finishedOn ?? null,
      wholeArtUrl:
        badge?.wholeArtId === undefined ? null : await ctx.storage.getUrl(badge.wholeArtId),
      lastVisitedPlaceId: visitsHere.at(-1)?.placeId ?? null,
      panels,
    };
  },
});

/** What a place's page needs. Null when the place isn't in a live set. */
export const forPlace = query({
  args: { placeId: v.id("place") },
  returns: v.union(
    v.null(),
    v.object({
      setId: v.id("collectionSet"),
      neighbourhoodId: v.string(),
      setNames: names,
      panelIndex: v.number(),
      panelCount: v.number(),
      visited: v.boolean(),
      panelDyed: v.boolean(),
      dyedPanels: v.array(v.number()),
      pickedLine: v.union(line, v.null()),
    }),
  ),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return null;
    const entry = await ctx.db
      .query("collectionPlace")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first();
    if (entry === null) return null;
    const found = await ctx.db.get("collectionSet", entry.setId);
    if (found === null || found.status !== "live") return null;
    const row = await rowOf(ctx, viewer);
    const dyed = dyedPanels(row, found._id);
    return {
      setId: found._id,
      neighbourhoodId: found.neighbourhoodId,
      setNames: found.names,
      panelIndex: entry.panelIndex,
      panelCount: found.panelCount,
      visited: row !== null && visitedHere(row, found._id, entry.panelIndex, placeId),
      panelDyed: dyed.has(entry.panelIndex),
      dyedPanels: [...dyed],
      pickedLine: await pickedLineFor(ctx, viewer, place, entry.pickedLineEn),
    };
  },
});

/** A place a steward has moved can still fill its new panel for someone who visited it before. */
function visitedHere(
  row: Pick<Doc<"personCollection">, "visits">,
  setId: Id<"collectionSet">,
  panelIndex: number,
  placeId: Id<"place">,
) {
  return row.visits.some(
    (visit) =>
      visit.placeId === placeId && visit.setId === setId && visit.panelIndex === panelIndex,
  );
}

/**
 * The phone has already found the person near enough. It takes only the place, keeps only the date
 * in the region's offset, and writes no audit entry, since an audit row is stamped with the time of
 * day (FR-105). A repeat visit adds nothing. The badge lands with the last panel, once.
 */
export const checkIn = mutation({
  args: { placeId: v.id("place") },
  returns: v.object({
    outcome: v.union(v.literal("dyed"), v.literal("already_dyed"), v.literal("already_here")),
    setId: v.id("collectionSet"),
    panelIndex: v.number(),
    dyedCount: v.number(),
    panelCount: v.number(),
    finished: v.boolean(),
  }),
  handler: async (ctx, { placeId }) => {
    const { person, place } = await checkablePlace(ctx, placeId);
    const entry = await ctx.db
      .query("collectionPlace")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first();
    const found = entry && (await ctx.db.get("collectionSet", entry.setId));
    if (!entry || !found || found.status !== "live") {
      throw appError("not_found", "this place is not in a live set");
    }
    // The account menu makes this row on sign-in. A check-in never does: a row made now would carry
    // the time of day in its creation time.
    const row = await rowOf(ctx, person);
    if (row === null) throw appError("conflict", "the collection is still being set up");
    const before = dyedPanels(row, found._id);
    const finishedBefore = row.badges.some(({ setId }) => setId === found._id);
    const result = {
      setId: found._id,
      panelIndex: entry.panelIndex,
      panelCount: found.panelCount,
    };
    if (visitedHere(row, found._id, entry.panelIndex, placeId)) {
      return {
        ...result,
        outcome: "already_here" as const,
        dyedCount: before.size,
        finished: finishedBefore,
      };
    }
    const day = dayAt(Date.now(), regionConfig(place.regionId).collection.utcOffsetHours);
    const visits = [
      ...row.visits,
      { placeId, setId: found._id, panelIndex: entry.panelIndex, day },
    ];
    const after = dyedPanels({ ...row, visits }, found._id);
    const finishes = !finishedBefore && after.size >= found.panelCount;
    await ctx.db.patch("personCollection", row._id, {
      visits,
      ...(finishes && {
        badges: [
          ...row.badges,
          {
            setId: found._id,
            names: found.names,
            ...(found.wholeArtId === undefined ? {} : { wholeArtId: found.wholeArtId }),
            finishedOn: day,
          },
        ],
      }),
    });
    return {
      ...result,
      outcome: before.has(entry.panelIndex) ? ("already_dyed" as const) : ("dyed" as const),
      dyedCount: after.size,
      finished: finishedBefore || finishes,
    };
  },
});

/** Publicly readable and pinned: the only kind of place a set may use (FR-114). */
function isUsable(place: Doc<"place"> | null): place is Doc<"place"> {
  return (
    place !== null &&
    place.visibility === "public" &&
    isPubliclyReadablePlace(place) &&
    place.hiddenReason === undefined
  );
}

/**
 * Makes a draft set for a neighbourhood from a checked list of place slugs. Admin only:
 *
 *   npx convex run collection:createSet '{"regionId": "nagasaki", "neighbourhoodId": "shinchi", ...}'
 */
export const createSet = internalMutation({
  args: {
    regionId: v.string(),
    neighbourhoodId: v.string(),
    names,
    panels: v.array(v.array(v.string())),
  },
  returns: v.id("collectionSet"),
  handler: async (ctx, { regionId, neighbourhoodId, names: setNames, panels }) => {
    const region = regionConfig(regionId);
    if (!region.neighbourhoods?.some(({ id }) => id === neighbourhoodId)) {
      throw appError("invalid_input", `no neighbourhood ${neighbourhoodId} in ${regionId}`);
    }
    if (region.locales.some((locale) => !setNames[locale])) {
      throw appError("invalid_input", "a set needs a name in every language of the region");
    }
    if (panels.length !== region.collection.panelsPerSet) {
      throw appError("invalid_input", `a set has ${region.collection.panelsPerSet} panels`);
    }
    const existing = await ctx.db
      .query("collectionSet")
      .withIndex("by_regionId_and_neighbourhoodId", (q) =>
        q.eq("regionId", regionId).eq("neighbourhoodId", neighbourhoodId),
      )
      .first();
    if (existing !== null) throw appError("conflict", `${neighbourhoodId} already has a set`);
    const setId = await ctx.db.insert("collectionSet", {
      regionId,
      neighbourhoodId,
      names: setNames,
      panelCount: panels.length,
      status: "draft",
    });
    for (const [panelIndex, slugs] of panels.entries()) {
      if (slugs.length < 1 || slugs.length > PLACES_PER_PANEL) {
        throw appError("invalid_input", `panel ${panelIndex + 1} needs 1 to 3 places`);
      }
      await ctx.db.insert("collectionPanel", { setId, index: panelIndex });
      for (const slug of slugs) {
        const place = await ctx.db
          .query("place")
          .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", regionId).eq("slug", slug))
          .unique();
        if (!isUsable(place)) throw appError("invalid_input", `${slug} is not a public place`);
        const taken = await ctx.db
          .query("collectionPlace")
          .withIndex("by_placeId", (q) => q.eq("placeId", place._id))
          .first();
        if (taken !== null) throw appError("conflict", `${slug} already fills a panel`);
        await ctx.db.insert("collectionPlace", { setId, panelIndex, placeId: place._id });
      }
    }
    return setId;
  },
});

/** Used by scripts/upload-set-art.mts. */
export const generateArtUploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/** Attaches an uploaded image to one panel, or to the whole picture when `panelIndex` is null. */
export const attachArt = internalMutation({
  args: {
    regionId: v.string(),
    neighbourhoodId: v.string(),
    panelIndex: v.union(v.number(), v.null()),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, { regionId, neighbourhoodId, panelIndex, storageId }) => {
    const found = await ctx.db
      .query("collectionSet")
      .withIndex("by_regionId_and_neighbourhoodId", (q) =>
        q.eq("regionId", regionId).eq("neighbourhoodId", neighbourhoodId),
      )
      .unique();
    if (found === null) throw appError("not_found", `no set for ${neighbourhoodId}`);
    if (panelIndex === null) {
      await ctx.db.patch("collectionSet", found._id, { wholeArtId: storageId });
      return null;
    }
    const panel = await ctx.db
      .query("collectionPanel")
      .withIndex("by_setId_and_index", (q) => q.eq("setId", found._id).eq("index", panelIndex))
      .unique();
    if (panel === null) throw appError("not_found", `no panel ${panelIndex}`);
    await ctx.db.patch("collectionPanel", panel._id, { artId: storageId });
    return null;
  },
});

/** Everything a steward needs to look after the region's sets, including what could go wrong. */
export const listForSteward = query({
  args: { regionId: v.string() },
  returns: v.array(
    v.object({
      id: v.id("collectionSet"),
      neighbourhoodId: v.string(),
      names,
      status: v.union(v.literal("draft"), v.literal("live")),
      hasWholeArt: v.boolean(),
      panels: v.array(
        v.object({
          index: v.number(),
          hasArt: v.boolean(),
          places: v.array(
            v.object({
              placeId: v.id("place"),
              slug: v.string(),
              names: placeNames,
              usable: v.boolean(),
              pickedLineEn: v.union(v.string(), v.null()),
              pickedLineLive: v.boolean(),
              sentences: v.array(v.object({ en: v.string(), ja: v.string() })),
            }),
          ),
        }),
      ),
      tooClose: v.array(v.object({ a: v.id("place"), b: v.id("place"), metres: v.number() })),
      candidates: v.array(
        v.object({ placeId: v.id("place"), slug: v.string(), names: placeNames }),
      ),
    }),
  ),
  handler: async (ctx, { regionId }) => {
    await requireRole(ctx, ["steward"]);
    const sets = (
      await Promise.all(
        (["draft", "live"] as const).map((status) =>
          ctx.db
            .query("collectionSet")
            .withIndex("by_regionId_and_status", (q) =>
              q.eq("regionId", regionId).eq("status", status),
            )
            .take(SET_LIMIT),
        ),
      )
    ).flat();
    const views = [];
    for (const found of sets) {
      const panels = [];
      const pinned: { placeId: Id<"place">; pin: { lat: number; lng: number } }[] = [];
      const inSet = new Set<Id<"place">>();
      for (const panel of await panelsOf(ctx, found)) {
        const entries = await ctx.db
          .query("collectionPlace")
          .withIndex("by_setId_and_panelIndex", (q) =>
            q.eq("setId", found._id).eq("panelIndex", panel.index),
          )
          .take(PLACES_PER_PANEL);
        const places = [];
        for (const entry of entries) {
          const place = await ctx.db.get("place", entry.placeId);
          if (place === null) continue;
          inSet.add(place._id);
          const pin = place.mapPin ?? (await readMapPin(ctx, place._id));
          if (pin) pinned.push({ placeId: place._id, pin });
          // Read as a signed-out visitor, so a line only a steward can see can't be picked.
          const story = isPubliclyReadablePlace(place) ? await liveStory(ctx, null, place) : null;
          const sentences = story?.sentences.map(({ en, ja }) => ({ en, ja })) ?? [];
          places.push({
            placeId: place._id,
            slug: place.slug,
            names: place.mapNames ?? (await readMapNames(ctx, place._id)),
            usable: isUsable(place) && pin !== null,
            pickedLineEn: entry.pickedLineEn ?? null,
            pickedLineLive: sentences.some(({ en }) => en === entry.pickedLineEn),
            sentences,
          });
        }
        panels.push({ index: panel.index, hasArt: panel.artId !== undefined, places });
      }
      const tooClose = pinned.flatMap((one, at) =>
        pinned.slice(at + 1).flatMap((other) => {
          const metres = Math.round(distanceMetres(one.pin, other.pin));
          return metres < SPREAD_METRES ? [{ a: one.placeId, b: other.placeId, metres }] : [];
        }),
      );
      const nearby = await ctx.db
        .query("place")
        .withIndex("by_regionId_and_neighbourhood_and_visibility", (q) =>
          q
            .eq("regionId", regionId)
            .eq("neighbourhood", found.neighbourhoodId)
            .eq("visibility", "public"),
        )
        .take(CANDIDATE_LIMIT);
      const candidates = [];
      for (const place of nearby) {
        if (inSet.has(place._id) || !isUsable(place) || !place.mapPin) continue;
        candidates.push({
          placeId: place._id,
          slug: place.slug,
          names: place.mapNames ?? (await readMapNames(ctx, place._id)),
        });
      }
      views.push({
        id: found._id,
        neighbourhoodId: found.neighbourhoodId,
        names: found.names,
        status: found.status,
        hasWholeArt: found.wholeArtId !== undefined,
        panels,
        tooClose,
        candidates,
      });
    }
    return views;
  },
});

/** Replaces a place on a panel. Keeps 1 to 3 places per panel, and undoes nobody's panel. */
export const swapPlace = mutation({
  args: {
    setId: v.id("collectionSet"),
    panelIndex: v.number(),
    removePlaceId: v.optional(v.id("place")),
    addPlaceId: v.optional(v.id("place")),
  },
  returns: v.null(),
  handler: async (ctx, { setId, panelIndex, removePlaceId, addPlaceId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const found = await ctx.db.get("collectionSet", setId);
    if (found === null) throw appError("not_found", "no such set");
    if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= found.panelCount) {
      throw appError("invalid_input", "no such panel");
    }
    const entries = await ctx.db
      .query("collectionPlace")
      .withIndex("by_setId_and_panelIndex", (q) =>
        q.eq("setId", setId).eq("panelIndex", panelIndex),
      )
      .take(PLACES_PER_PANEL + 1);
    const leaving = entries.find(({ placeId }) => placeId === removePlaceId);
    if (removePlaceId !== undefined && leaving === undefined) {
      throw appError("not_found", "that place is not on this panel");
    }
    const count = entries.length - (leaving ? 1 : 0) + (addPlaceId ? 1 : 0);
    if (count < 1 || count > PLACES_PER_PANEL) {
      throw appError("conflict", "a panel holds 1 to 3 places");
    }
    if (addPlaceId !== undefined) {
      const place = await ctx.db.get("place", addPlaceId);
      if (!isUsable(place) || !place.mapPin) {
        throw appError("invalid_input", "a set uses only public places with a pin");
      }
      const taken = await ctx.db
        .query("collectionPlace")
        .withIndex("by_placeId", (q) => q.eq("placeId", addPlaceId))
        .first();
      if (taken !== null) throw appError("conflict", "that place already fills a panel");
      await ctx.db.insert("collectionPlace", { setId, panelIndex, placeId: addPlaceId });
    }
    if (leaving) await ctx.db.delete("collectionPlace", leaving._id);
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "collection.swap_place",
      targetType: "collectionSet",
      targetId: setId,
      diff: { panelIndex, removePlaceId: removePlaceId ?? null, addPlaceId: addPlaceId ?? null },
    });
    return null;
  },
});

/**
 * Picks the line a person sees after checking in. It must be a sentence already live on the place's
 * page for everyone, so nothing new is written for this feature (FR-117). Null clears it.
 */
export const pickLine = mutation({
  args: { placeId: v.id("place"), en: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { placeId, en }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const entry = await ctx.db
      .query("collectionPlace")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first();
    if (entry === null) throw appError("not_found", "this place is not in a set");
    if (en === null) {
      await ctx.db.patch("collectionPlace", entry._id, { pickedLineEn: undefined });
    } else {
      const place = await ctx.db.get("place", placeId);
      const story = place && isUsable(place) ? await liveStory(ctx, null, place) : null;
      if (!story?.sentences.some((sentence) => sentence.en === en)) {
        throw appError(
          "invalid_input",
          "a picked line must be a sentence live on the place's page",
        );
      }
      await ctx.db.patch("collectionPlace", entry._id, { pickedLineEn: en });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "collection.pick_line",
      targetType: "place",
      targetId: placeId,
      diff: { pickedLineEn: en },
    });
    return null;
  },
});

/** A set goes live only with its art on every panel and a usable place on every panel. */
export const setStatus = mutation({
  args: {
    setId: v.id("collectionSet"),
    status: v.union(v.literal("draft"), v.literal("live")),
  },
  returns: v.null(),
  handler: async (ctx, { setId, status }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const found = await ctx.db.get("collectionSet", setId);
    if (found === null) throw appError("not_found", "no such set");
    if (found.status === status) return null;
    if (status === "live") {
      const panels = await panelsOf(ctx, found);
      if (
        found.wholeArtId === undefined ||
        panels.length !== found.panelCount ||
        panels.some((panel) => panel.artId === undefined)
      ) {
        throw appError("conflict", "every panel and the whole picture need their art first");
      }
      for (const panel of panels) {
        const entries = await ctx.db
          .query("collectionPlace")
          .withIndex("by_setId_and_panelIndex", (q) =>
            q.eq("setId", setId).eq("panelIndex", panel.index),
          )
          .take(PLACES_PER_PANEL);
        const places = await Promise.all(
          entries.map(({ placeId }) => ctx.db.get("place", placeId)),
        );
        if (!places.some((place) => isUsable(place) && place.mapPin)) {
          throw appError("conflict", `panel ${panel.index + 1} needs a public place with a pin`);
        }
      }
    }
    await ctx.db.patch("collectionSet", setId, { status });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "collection.set_status",
      targetType: "collectionSet",
      targetId: setId,
      diff: { status: { from: found.status, to: status } },
    });
    return null;
  },
});

/**
 * SC-105, before any pilot talk: how many real people checked in at all, and how many reached a
 * second place on the same or the next day. Two totals that identify nobody.
 */
export const repeatVisitTotals = internalQuery({
  args: {},
  returns: v.object({ checkedIn: v.number(), cameBackSoon: v.number() }),
  handler: async (ctx) => {
    const rows = await ctx.db.query("personCollection").take(TOTALS_LIMIT);
    if (rows.length >= TOTALS_LIMIT) console.warn(`repeatVisitTotals: read only ${TOTALS_LIMIT}`);
    let checkedIn = 0;
    let cameBackSoon = 0;
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (const row of rows) {
      if (row.visits.length === 0) continue;
      const person = await ctx.db.get("person", row.personId);
      if (person === null || person.isMock) continue;
      checkedIn += 1;
      const days = row.visits.map(({ day }) => Date.parse(`${day}T00:00:00Z`));
      if (
        days.some((day, at) => days.some((other, i) => i > at && Math.abs(other - day) <= DAY_MS))
      ) {
        cameBackSoon += 1;
      }
    }
    return { checkedIn, cameBackSoon };
  },
});
