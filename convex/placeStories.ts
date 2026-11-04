import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./lib/gate";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { canSeeSource, countsVisits, isPubliclyReadablePlace } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { readMapNames } from "./lib/mapCopies";
import { scriptValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";
import { guessLang, type MentionPlatform } from "../src/lib/story-finder/mention";
import {
  mentionPlatformValidator,
  storyRunStatusValidator,
  storyStepValidator,
} from "./tables/storyFinder";

/**
 * The story agent's data: a run for each time it writes a place's story, and the story itself.
 * The work happens in placeStoryActions.writeStory and lib/story-agent; these functions hold its state
 * and show the result. A story is public; its run, which quotes the drafts, is for stewards.
 */

/** What the agent reads unless a batch names more. */
const DEFAULT_PLATFORMS: MentionPlatform[] = [
  "google_reviews",
  "web",
  "instagram",
  "facebook",
  "tiktok",
  "reddit",
];
/** One post has nothing to compare with, so its card says it better than a story would. */
const MIN_POSTS = 2;
/** The second reader takes about four minutes to wake; a run looks again this often. */
const WAKE_RETRY_MS = 30_000;
const MAX_WAKE_ATTEMPTS = 24;
const MAX_STEPS = 60;
/** The most runs one batch starts, so a typo can't start thousands of paid calls. */
const MAX_BATCH = 150;
const READY_SCAN = 800;
/** The most places one night starts, so a big collection spreads over several nights. */
const NIGHTLY_LIMIT = 20;
const BATCH_SPACING_MS = 10_000;

async function batchSteward(ctx: QueryCtx, personId: Id<"person">) {
  const person = await ctx.db.get("person", personId);
  if (person?.role !== "steward")
    throw appError("invalid_input", "stewardPersonId must name an existing steward");
  if (person.isMock) throw appError("invalid_input", "a mock steward cannot run the story agent");
  return person;
}

/**
 * Places on the map with no story yet, enough checked posts and at least one the check called a story,
 * those with the most stories first. A place with only tips has nothing for the agent to retell.
 */
async function readyPlaces(
  ctx: QueryCtx,
  platforms: readonly MentionPlatform[],
  limit: number,
  minPosts = MIN_POSTS,
) {
  const counts = new Map<Id<"place">, { posts: number; stories: number }>();
  const rows = await ctx.db
    .query("mentionCandidate")
    .withIndex("by_status_and_attachedAt", (q) => q.eq("status", "attached"))
    .order("desc")
    .take(READY_SCAN);
  for (const row of rows) {
    if (!platforms.includes(row.platform) || !row.text) continue;
    const count = counts.get(row.placeId) ?? { posts: 0, stories: 0 };
    count.posts += 1;
    if (row.verdict?.kind === "story") count.stories += 1;
    counts.set(row.placeId, count);
  }
  const ranked = [...counts]
    .filter(([, count]) => count.stories > 0 && count.posts >= minPosts)
    .sort(([, a], [, b]) => b.stories - a.stories || b.posts - a.posts);
  const ready: { place: Doc<"place">; posts: number }[] = [];
  for (const [placeId, { posts }] of ranked) {
    if (ready.length >= limit) break;
    const place = await ctx.db.get("place", placeId);
    if (place === null || !isPubliclyReadablePlace(place) || place.hiddenReason !== undefined)
      continue;
    const story = await ctx.db
      .query("placeStory")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first();
    if (story === null) ready.push({ place, posts });
  }
  return ready;
}

async function startRun(
  ctx: MutationCtx,
  placeId: Id<"place">,
  requestedBy: Id<"person">,
  platforms: MentionPlatform[],
  delayMs: number,
) {
  const runId = await ctx.db.insert("placeStoryRun", {
    placeId,
    requestedBy,
    status: "queued",
    platforms,
    steps: [],
    wakeAttempts: 0,
  });
  await ctx.scheduler.runAfter(delayMs, internal.placeStoryActions.writeStory, { runId });
  return runId;
}

async function startBatch(
  ctx: MutationCtx,
  steward: Doc<"person">,
  places: readonly Doc<"place">[],
  platforms: MentionPlatform[],
  spacingMs = BATCH_SPACING_MS,
) {
  let delay = 0;
  for (const place of places) {
    await startRun(ctx, place._id, steward._id, platforms, delay);
    delay += spacingMs;
  }
  await writeAudit(ctx, {
    actorKind: "person",
    actorPersonId: steward._id,
    action: "story_agent.batch",
    targetType: "place",
    diff: { started: places.length, platforms },
  });
  return { started: places.length };
}

/** A steward asks the agent to write (or write again) one place's story, from the steward's page. */
export const request = mutation({
  args: { placeId: v.id("place") },
  returns: v.id("placeStoryRun"),
  handler: async (ctx, { placeId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    if (steward.isMock) throw appError("forbidden", "a demo account may not run the story agent");
    const place = await ctx.db.get("place", placeId);
    if (place === null) throw appError("not_found", "place not found");
    if (!isPubliclyReadablePlace(place)) throw appError("conflict", "the place is not on the map");
    const runId = await startRun(ctx, placeId, steward._id, DEFAULT_PLATFORMS, 0);
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "story_agent.requested",
      targetType: "place",
      targetId: placeId,
      diff: { runId },
    });
    return runId;
  },
});

/**
 * Starts the agent, spaced out, on the places that are ready or on exactly the places named (for a
 * batch from the command line). A named place must be on the map, and may already have a story, which
 * the run replaces.
 */
export const enqueue = internalMutation({
  args: {
    stewardPersonId: v.id("person"),
    limit: v.number(),
    placeIds: v.optional(v.array(v.id("place"))),
    platforms: v.optional(v.array(mentionPlatformValidator)),
    minPosts: v.optional(v.number()),
    spacingMs: v.optional(v.number()),
  },
  returns: v.object({ started: v.number() }),
  handler: async (ctx, { stewardPersonId, limit, placeIds, platforms, minPosts, spacingMs }) => {
    const steward = await batchSteward(ctx, stewardPersonId);
    if (limit > MAX_BATCH) throw appError("invalid_input", `start at most ${MAX_BATCH}`);
    const reading = platforms ?? DEFAULT_PLATFORMS;
    const named = placeIds && (await Promise.all(placeIds.map((id) => ctx.db.get("place", id))));
    const ready = named
      ? named
          .filter((place) => place !== null && isPubliclyReadablePlace(place))
          .slice(0, limit)
          .map((place) => ({ place: place! }))
      : await readyPlaces(ctx, reading, limit, minPosts);
    return await startBatch(
      ctx,
      steward,
      ready.map(({ place }) => place),
      reading,
      spacingMs,
    );
  },
});

/**
 * Each night the agent writes the places that became ready, so nobody has to press anything. A place
 * it found nothing for keeps its empty row and isn't read again; a run that failed is tried the next
 * night. The audit names the first real steward, and with none there is nothing to run under.
 */
export const writeReadyStories = internalMutation({
  args: {},
  returns: v.object({ started: v.number() }),
  handler: async (ctx) => {
    const stewards = await ctx.db
      .query("person")
      .withIndex("by_role", (q) => q.eq("role", "steward"))
      .take(50);
    const steward = stewards.find(({ isMock }) => !isMock);
    if (steward === undefined) return { started: 0 };
    const ready = await readyPlaces(ctx, DEFAULT_PLATFORMS, NIGHTLY_LIMIT);
    if (ready.length === 0) return { started: 0 };
    return await startBatch(
      ctx,
      steward,
      ready.map(({ place }) => place),
      DEFAULT_PLATFORMS,
    );
  },
});

/**
 * Takes a story off its page and keeps the place off the ready list, for one a person read and found
 * not worth telling, or a place they don't want the agent writing about. With offerAgain the place goes
 * back on the ready list instead.
 */
export const withdraw = internalMutation({
  args: {
    stewardPersonId: v.id("person"),
    placeId: v.id("place"),
    reason: v.string(),
    offerAgain: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { stewardPersonId, placeId, reason, offerAgain }) => {
    const steward = await batchSteward(ctx, stewardPersonId);
    const story = await ctx.db
      .query("placeStory")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first();
    const now = Date.now();
    if (offerAgain) {
      if (story !== null) await ctx.db.delete("placeStory", story._id);
    } else if (story !== null) {
      await ctx.db.patch("placeStory", story._id, { withdrawnAt: now });
    } else {
      await ctx.db.insert("placeStory", {
        placeId,
        sentences: [],
        postsRead: 0,
        writer: "",
        checker: "",
        publishedAt: now,
        withdrawnAt: now,
      });
    }
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "story_agent.withdrawn",
      targetType: "place",
      targetId: placeId,
      diff: { reason, offerAgain: offerAgain ?? false },
    });
    return null;
  },
});

const beginResult = v.union(
  v.null(),
  v.object({
    place: v.object({
      names: v.array(v.object({ lang: v.string(), value: v.string() })),
      category: v.optional(v.string()),
    }),
    posts: v.array(
      v.object({
        id: v.string(),
        platform: v.string(),
        text: v.string(),
        title: v.optional(v.string()),
      }),
    ),
  }),
);

/** Takes a queued or waiting run and returns what the agent reads; null when it has nothing to do. */
export const beginRun = internalMutation({
  args: { runId: v.id("placeStoryRun"), writer: v.string(), checker: v.string() },
  returns: beginResult,
  handler: async (ctx, { runId, writer, checker }) => {
    const run = await ctx.db.get("placeStoryRun", runId);
    if (run === null || (run.status !== "queued" && run.status !== "waiting")) return null;
    const place = await ctx.db.get("place", run.placeId);
    if (place === null || !isPubliclyReadablePlace(place)) {
      await ctx.db.patch("placeStoryRun", runId, {
        status: "failed",
        error: "the place is not on the map",
        finishedAt: Date.now(),
      });
      return null;
    }
    const rows = await ctx.db
      .query("mentionCandidate")
      .withIndex("by_placeId_and_canonicalUrl", (q) => q.eq("placeId", run.placeId))
      .take(200);
    const posts = [];
    for (const row of rows) {
      if (row.status !== "attached" || !row.sourceId || !row.text) continue;
      if (!run.platforms.includes(row.platform)) continue;
      const source = await ctx.db.get("source", row.sourceId);
      if (source?.status !== "live") continue;
      posts.push({
        id: String(row.sourceId),
        platform: row.platform,
        text: row.text,
        ...(row.title === undefined ? {} : { title: row.title }),
      });
    }
    if (posts.length === 0) {
      await ctx.db.patch("placeStoryRun", runId, { status: "nothing", finishedAt: Date.now() });
      return null;
    }
    await ctx.db.patch("placeStoryRun", runId, { status: "running", writer, checker });
    const names = place.mapNames ?? (await readMapNames(ctx, place._id));
    return {
      place: {
        names: names.map(({ lang, value }) => ({ lang, value })),
        ...(place.category === undefined ? {} : { category: place.category }),
      },
      posts,
    };
  },
});

export const addStep = internalMutation({
  args: { runId: v.id("placeStoryRun"), step: storyStepValidator },
  returns: v.null(),
  handler: async (ctx, { runId, step }) => {
    const run = await ctx.db.get("placeStoryRun", runId);
    if (run === null || run.steps.length >= MAX_STEPS) return null;
    await ctx.db.patch("placeStoryRun", runId, { steps: [...run.steps, step] });
    return null;
  },
});

/** The second reader is asleep: comes back to this run later, and the same wake serves every run. */
export const waitForChecker = internalMutation({
  args: { runId: v.id("placeStoryRun"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, error }) => {
    const run = await ctx.db.get("placeStoryRun", runId);
    if (run === null) return null;
    if (run.wakeAttempts >= MAX_WAKE_ATTEMPTS) {
      await ctx.db.patch("placeStoryRun", runId, {
        status: "failed",
        error,
        finishedAt: Date.now(),
      });
      return null;
    }
    // A wait partway through starts the place again, so the log shows one clean run.
    await ctx.db.patch("placeStoryRun", runId, {
      status: "waiting",
      steps: [],
      wakeAttempts: run.wakeAttempts + 1,
    });
    await ctx.scheduler.runAfter(WAKE_RETRY_MS, internal.placeStoryActions.writeStory, { runId });
    return null;
  },
});

export const failRun = internalMutation({
  args: { runId: v.id("placeStoryRun"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, error }) => {
    await ctx.db.patch("placeStoryRun", runId, {
      status: "failed",
      error,
      finishedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Publishes what survived. A post erased while the agent was working takes its sentences with it. A run
 * that ends with nothing takes any earlier story off the page, since the agent no longer stands behind
 * it, and keeps the place off the ready list.
 */
export const saveStory = internalMutation({
  args: {
    runId: v.id("placeStoryRun"),
    sentences: v.array(
      v.object({
        en: v.string(),
        ja: v.string(),
        citations: v.array(v.object({ postId: v.string(), words: v.string() })),
      }),
    ),
    postsRead: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, sentences, postsRead }) => {
    const run = await ctx.db.get("placeStoryRun", runId);
    if (run === null) return null;
    const kept = [];
    for (const { en, ja, citations } of sentences) {
      const cited = [];
      for (const { postId, words } of citations) {
        const sourceId = ctx.db.normalizeId("source", postId);
        const source = sourceId === null ? null : await ctx.db.get("source", sourceId);
        if (sourceId !== null && source?.status === "live" && source.placeId === run.placeId)
          cited.push({ sourceId, words });
      }
      if (cited.length === citations.length && cited.length > 0)
        kept.push({ en, ja, citations: cited });
    }
    const existing = await ctx.db
      .query("placeStory")
      .withIndex("by_placeId", (q) => q.eq("placeId", run.placeId))
      .first();
    const now = Date.now();
    const story = {
      placeId: run.placeId,
      sentences: kept,
      postsRead,
      writer: run.writer ?? "",
      checker: run.checker ?? "",
      publishedAt: now,
      ...(kept.length === 0 ? { withdrawnAt: now } : {}),
    };
    if (existing === null) await ctx.db.insert("placeStory", story);
    else await ctx.db.replace("placeStory", existing._id, story);
    await ctx.db.patch(
      "placeStoryRun",
      runId,
      kept.length === 0
        ? { status: "nothing", finishedAt: now }
        : { status: "published", published: kept.length, finishedAt: now },
    );
    return null;
  },
});

const noteView = v.object({
  sourceId: v.id("source"),
  words: v.string(),
  lang: v.optional(v.string()),
  platform: v.optional(v.string()),
  canonicalUrl: v.string(),
  authorHandle: v.optional(v.string()),
  postedAt: v.optional(v.number()),
  countsVisits: v.boolean(),
});

/**
 * A place's story for its public page. Each sentence names the notes behind it by position. A sentence
 * citing a post that is no longer shown comes off the page with it.
 */
export const forPlace = query({
  args: { placeId: v.id("place") },
  returns: v.union(
    v.null(),
    v.object({
      sentences: v.array(v.object({ en: v.string(), ja: v.string(), notes: v.array(v.number()) })),
      notes: v.array(noteView),
      postsRead: v.number(),
    }),
  ),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return null;
    const story = await ctx.db
      .query("placeStory")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .first();
    if (story === null || story.withdrawnAt !== undefined) return null;
    const sentences = [];
    const notes = [];
    const numbered = new Map<string, number>();
    for (const { en, ja, citations } of story.sentences) {
      const sources = [];
      for (const { sourceId, words } of citations) {
        const source = await ctx.db.get("source", sourceId);
        if (source !== null && (await canSeeSource(ctx, viewer, place, source)))
          sources.push({ source, words });
      }
      if (sources.length === 0 || sources.length < citations.length) continue;
      const at = [];
      for (const { source, words } of sources) {
        const key = JSON.stringify([source._id, words]);
        let index = numbered.get(key);
        if (index === undefined) {
          index = notes.length;
          numbered.set(key, index);
          const lang = guessLang(words);
          notes.push({
            sourceId: source._id,
            words,
            ...(lang === undefined ? {} : { lang }),
            ...(source.platform === undefined ? {} : { platform: source.platform }),
            canonicalUrl: source.canonicalUrl,
            ...(source.authorHandle === undefined ? {} : { authorHandle: source.authorHandle }),
            ...(source.postedAt === undefined ? {} : { postedAt: source.postedAt }),
            countsVisits: countsVisits(place, source),
          });
        }
        at.push(index);
      }
      sentences.push({ en, ja, notes: at });
    }
    if (sentences.length === 0) return null;
    return { sentences, notes, postsRead: story.postsRead };
  },
});

const placeNameView = v.object({
  lang: v.string(),
  script: scriptValidator,
  value: v.string(),
  isPrimary: v.boolean(),
});

/** The steward's panel: places ready for a story, and the newest runs with everything they did. */
export const stewardPanel = query({
  args: {},
  returns: v.object({
    ready: v.array(
      v.object({
        placeId: v.id("place"),
        placeSlug: v.string(),
        placeNames: v.array(placeNameView),
        posts: v.number(),
      }),
    ),
    runs: v.array(
      v.object({
        runId: v.id("placeStoryRun"),
        placeId: v.id("place"),
        placeSlug: v.string(),
        placeNames: v.array(placeNameView),
        status: storyRunStatusValidator,
        steps: v.array(storyStepValidator),
        writer: v.optional(v.string()),
        checker: v.optional(v.string()),
        published: v.optional(v.number()),
        error: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireRole(ctx, ["steward"]);
    const named = async (place: Doc<"place">) =>
      place.mapNames ?? (await readMapNames(ctx, place._id));
    const ready = await Promise.all(
      (await readyPlaces(ctx, DEFAULT_PLATFORMS, 5)).map(async ({ place, posts }) => ({
        placeId: place._id,
        placeSlug: place.slug,
        placeNames: await named(place),
        posts,
      })),
    );
    const runs = [];
    for (const run of await ctx.db.query("placeStoryRun").order("desc").take(6)) {
      const place = await ctx.db.get("place", run.placeId);
      if (place === null) continue;
      runs.push({
        runId: run._id,
        placeId: run.placeId,
        placeSlug: place.slug,
        placeNames: await named(place),
        status: run.status,
        steps: run.steps,
        ...(run.writer === undefined ? {} : { writer: run.writer }),
        ...(run.checker === undefined ? {} : { checker: run.checker }),
        ...(run.published === undefined ? {} : { published: run.published }),
        ...(run.error === undefined ? {} : { error: run.error }),
      });
    }
    return { ready, runs };
  },
});
