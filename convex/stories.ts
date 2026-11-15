import { v, type Infer } from "convex/values";
import { aiReadingOffered } from "../src/lib/connector/policy";
import {
  CARRIED_SHOWN_LIMIT,
  carryDistance,
  nearestCarryTargets,
  threadOn,
} from "../src/lib/slip/carry";
import { cleanQuestion, isStarterKey } from "../src/lib/slip/question";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import {
  canEditPlace,
  isPubliclyReadablePlace,
  isSharedPublicly,
  isStoryShown,
  loadReadablePlace,
} from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requireConfirmedName, requirePerson } from "./lib/auth";
import { appError } from "./lib/errors";
import { excerptTranslations, hasNoCard } from "./lib/foundPosts";
import { mutation } from "./lib/gate";
import { withMock } from "./lib/mock";
import { readMapNames } from "./lib/mapCopies";
import { isPublicRealPlace, nameView, publicPool, toPoolPlace } from "./lib/publicPool";
import { carriedQuestionShown, placeRef, placeRefOf, type PlaceRef } from "./lib/relay";
import { limitContribution } from "./lib/rateLimit";
import { isRegionLocale, regionConfig } from "./lib/region";
import {
  attachPhotos,
  placePhotoRules,
  removeStoryPhotos,
  storyPhotoView,
  storyPhotoViews,
} from "./lib/storyPhotos";
import { scriptValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

const BODY_LIMIT = 1000;
/** How many of the newest stories and shared posts the home page looks through, and shows. */
const LATEST_SCAN = 40;
const LATEST_LIMIT = 8;
/** Found posts arrive in batches; at most this many show, so members' own stories stay in view. */
const LATEST_FOUND_LIMIT = 4;
/**
 * A place page shows up to this many stories, reading further back than that so one regular can't
 * push everyone else off the page, and at most this many of any one person's.
 */
const PLACE_SCAN = 200;
const PLACE_LIMIT = 50;
const PLACE_PER_PERSON = 20;

/** Questions carried to one place that are read to find the newest few that still show. */
const CARRIED_SCAN = 50;

/** The earliest stories of a place read to find the first teller; a place has a handful. */
const FIRST_SCAN = 20;

/** What a story answers, ready to show: the question's words and who asked, or a starter's key. */
const answerView = v.union(
  v.object({
    kind: v.literal("story"),
    text: v.string(),
    lang: v.string(),
    askedBy: v.string(),
    /** Set when the question was written at another place and carried to this one. */
    from: v.optional(placeRef),
  }),
  v.object({ kind: v.literal("starter"), key: v.string() }),
);

const storyView = v.object({
  _id: v.id("story"),
  body: v.string(),
  lang: v.string(),
  authorName: v.string(),
  /**
   * Which of this place's stories share a writer: the id of that writer's earliest story here among
   * those returned. It says nothing about the person, and nothing that holds at another place.
   */
  authorKey: v.string(),
  addedAt: v.number(),
  isMock: v.boolean(),
  addedByMe: v.boolean(),
  canRemove: v.boolean(),
  photos: v.array(storyPhotoView),
  /**
   * The writer allowed AI to read this story with their name: Noren's planner, and assistants such as
   * Claude or ChatGPT through the connector. It changes nothing on Noren's own pages;
   * src/lib/connector/policy.ts reads it.
   */
  connectorAllowed: v.boolean(),
  /**
   * The question the writer left for the next visitor, in the story's own language. Only while
   * walk mode is on, like everything about the sealed slip.
   */
  nextQuestion: v.optional(v.string()),
  /**
   * The place the question is carried to, while "three doors" is on and that place is still a real
   * place on the public map. Then the question is not for the next visitor here.
   */
  nextQuestionFor: v.optional(placeRef),
  /** What this story answers, while that question is still showing. */
  answers: v.optional(answerView),
  /** The earliest shown story of the place (false while walk mode is off). */
  firstTeller: v.boolean(),
});

/**
 * The stored form of what a new story answers, or undefined when it answers nothing valid: a story's
 * question must be open at this place and shown. It is open here when it was written here for the
 * next visitor (not addressed elsewhere), or, while "three doors" is on, carried here from another
 * place that is still a real place on the public map.
 */
async function answeredBy(
  ctx: QueryCtx,
  place: Doc<"place">,
  answers: { kind: "story"; storyId: string } | { kind: "starter"; key: string },
  carry: boolean,
): Promise<Doc<"story">["answers"]> {
  if (answers.kind === "starter")
    return isStarterKey(answers.key) ? { kind: "starter", key: answers.key } : undefined;
  const id = ctx.db.normalizeId("story", answers.storyId);
  const asked = id === null ? null : await ctx.db.get("story", id);
  if (asked === null || asked.nextQuestion === undefined) return undefined;
  if (asked.placeId === place._id) {
    return isStoryShown(place, asked) && asked.nextQuestionFor === undefined
      ? { kind: "story", storyId: asked._id }
      : undefined;
  }
  if (!carry || asked.nextQuestionFor !== place._id) return undefined;
  const source = await ctx.db.get("place", asked.placeId);
  return carriedQuestionShown(source, asked) ? { kind: "story", storyId: asked._id } : undefined;
}

/**
 * Whether a question written at `place` may be carried to `targetId`, or the reason it may not. The
 * target must be a different real place in the same region that a signed-out visitor can see and
 * that has a pin; the place written at must be one too (its name shows on the target's page); and
 * the two pins must be within CARRY_MAX_METRES. One message for every target problem, so a refusal
 * says nothing about a place the writer cannot see.
 */
async function requireCarryTarget(
  ctx: QueryCtx,
  person: Doc<"person">,
  place: Doc<"place">,
  targetId: Id<"place">,
  hasQuestion: boolean,
): Promise<Id<"place">> {
  if (!hasQuestion)
    throw appError("invalid_input", "a question carried to another place needs the question");
  if (person.isMock || place.isMock)
    throw appError("invalid_input", "a demo account cannot carry a question to another place");
  const refused = () => appError("invalid_input", "a question cannot be carried to that place");
  if (targetId === place._id) throw refused();
  const target = await ctx.db.get("place", targetId);
  if (target === null || target.regionId !== place.regionId) throw refused();
  const region = regionConfig(place.regionId);
  const there = await toPoolPlace(ctx, region, target);
  if (there === null) throw refused();
  const here = await toPoolPlace(ctx, region, place);
  if (here === null)
    throw appError(
      "invalid_input",
      "a question can be carried only from a real place that is on the public map",
    );
  if (!carryDistance(here.pin, there.pin).allowed) throw refused();
  return target._id;
}

/**
 * Any signed-in member writes what they heard, saw or tasted at a place they can read (FR-033). The
 * form says the story is shown in public with their name; writing it is the agreement.
 */
export const add = mutation({
  args: {
    placeId: v.id("place"),
    body: v.string(),
    lang: v.string(),
    photoIds: v.optional(v.array(v.id("storyPhoto"))),
    /** The writer's tick that Noren and the place may share this on Instagram; only while the region offers it. */
    shareConsent: v.optional(v.boolean()),
    /** The writer's tick that AI may read this story, with their name (the planner and the connector); only while either is on. */
    connectorAllowed: v.optional(v.boolean()),
    /**
     * A question for the next visitor, 1 to 140 characters with no contact details. Refused while
     * walk mode is off. The story's own language; never translated, never sent to AI.
     */
    nextQuestion: v.optional(v.string()),
    /**
     * Another place to carry that question to ("three doors"), a short walk away. Refused unless
     * walk mode and the thread switch are both on, the question is given, and the target is a
     * different real place in this region on the public map within CARRY_MAX_METRES of this one.
     */
    nextQuestionFor: v.optional(v.id("place")),
    /**
     * What this story answers. A story's question must be at this same place, shown, and still
     * have its question; a starter must be on the list. Anything else is dropped, and the story is
     * written without it. Ignored while walk mode is off. The id is a plain string so that a
     * mangled link cannot make the write fail.
     */
    answers: v.optional(
      v.union(
        v.object({ kind: v.literal("story"), storyId: v.string() }),
        v.object({ kind: v.literal("starter"), key: v.string() }),
      ),
    ),
  },
  returns: v.id("story"),
  handler: async (
    ctx,
    {
      placeId,
      body,
      lang,
      photoIds,
      shareConsent,
      connectorAllowed,
      nextQuestion,
      nextQuestionFor,
      answers,
    },
  ) => {
    const person = await requirePerson(ctx);
    requireConfirmedName(person);
    const place = await loadReadablePlace(ctx, person, placeId);
    const text = body.trim();
    if (!text || text.length > BODY_LIMIT)
      throw appError("invalid_input", `a story is 1 to ${BODY_LIMIT} characters`);
    if (!isRegionLocale(regionConfig(place.regionId), lang))
      throw appError("invalid_input", "lang must be a region locale");
    if (shareConsent && !regionConfig(place.regionId).sharing.norenAccount)
      throw appError("invalid_input", "this region does not offer sharing on Noren's accounts");
    if (connectorAllowed && !aiReadingOffered(regionConfig(place.regionId).features))
      throw appError("invalid_input", "this region does not offer AI reading of stories");
    const { features } = regionConfig(place.regionId);
    const relay = features.walk;
    const carry = threadOn(features);
    let question: string | undefined;
    if (nextQuestion !== undefined) {
      if (!relay) {
        if (nextQuestion) throw appError("invalid_input", "this region does not offer questions");
      } else {
        const checked = cleanQuestion(nextQuestion);
        if (checked.ok) question = checked.text;
        else if (checked.reason !== "empty")
          throw appError(
            "invalid_input",
            checked.reason === "long"
              ? "a question is 1 to 140 characters"
              : "a question may not hold a link, an email address, an @name or a phone number",
          );
      }
    }
    let carriedTo: Id<"place"> | undefined;
    if (nextQuestionFor !== undefined) {
      if (!carry)
        throw appError("invalid_input", "this region does not offer carrying a question elsewhere");
      carriedTo = await requireCarryTarget(
        ctx,
        person,
        place,
        nextQuestionFor,
        question !== undefined,
      );
    }
    const answered =
      relay && answers !== undefined ? await answeredBy(ctx, place, answers, carry) : undefined;
    await limitContribution(ctx, person, "story", place.regionId);
    const storyId = await ctx.db.insert(
      "story",
      withMock(person, {
        placeId,
        authorPersonId: person._id,
        body: text,
        lang,
        status: "live" as const,
        ...(question === undefined ? {} : { nextQuestion: question }),
        ...(carriedTo === undefined ? {} : { nextQuestionFor: carriedTo }),
        ...(answered === undefined ? {} : { answers: answered }),
        ...(shareConsent ? { shareConsentAt: Date.now() } : {}),
        ...(connectorAllowed ? { connectorAllowedAt: Date.now() } : {}),
      }),
    );
    if (shareConsent)
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "story.share_consent_given",
        targetType: "story",
        targetId: storyId,
        diff: { shareConsent: true },
      });
    if (connectorAllowed)
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "story.connector_allowed",
        targetType: "story",
        targetId: storyId,
        diff: { connectorAllowed: true },
      });
    await attachPhotos(ctx, { person, place, storyId, photoIds: photoIds ?? [] });
    return storyId;
  },
});

/** Live stories, newest first. A demo account's story shows on a real place only to its writer. */
export const listForPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(storyView),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return [];
    const stories = await ctx.db
      .query("story")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
      .order("desc")
      .take(PLACE_SCAN);
    const photoRules = await placePhotoRules(ctx, viewer, place);
    const authors = new Map<Id<"person">, { name: string; shown: number; key: Id<"story"> }>();
    const shown = [];
    for (const story of stories) {
      if (shown.length >= PLACE_LIMIT) break;
      const addedByMe = viewer !== null && story.authorPersonId === viewer._id;
      if (!isStoryShown(place, story) && !addedByMe) continue;
      let author = authors.get(story.authorPersonId);
      if (author === undefined) {
        const person = await ctx.db.get("person", story.authorPersonId);
        author = { name: person?.displayName ?? "", shown: 0, key: story._id };
        authors.set(story.authorPersonId, author);
      }
      if (author.shown >= PLACE_PER_PERSON) continue;
      author.shown++;
      // Read newest first, so the last story kept for a person is their earliest here.
      author.key = story._id;
      shown.push({ story, author, addedByMe });
    }
    // The relay (a question for the next visitor, first teller) shows only while walk mode is on.
    const { features } = regionConfig(place.regionId);
    const relay = features.walk;
    const carry = threadOn(features);
    let firstId: Id<"story"> | undefined;
    if (relay) {
      // The earliest shown story may lie beyond the window above, so it is read from the other end.
      const earliest = await ctx.db
        .query("story")
        .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
        .order("asc")
        .take(FIRST_SCAN);
      firstId = earliest.find((story) => isStoryShown(place, story))?._id;
    }
    const names = new Map<Id<"person">, string>();
    const nameOf = async (personId: Id<"person">) => {
      let name = names.get(personId);
      if (name === undefined) {
        name = (await ctx.db.get("person", personId))?.displayName ?? "";
        names.set(personId, name);
      }
      return name;
    };
    // Places read for a carried question: where it was written, or where it is carried to.
    const others = new Map<Id<"place">, Doc<"place"> | null>();
    const otherPlace = async (id: Id<"place">) => {
      if (!others.has(id)) others.set(id, await ctx.db.get("place", id));
      return others.get(id) ?? null;
    };
    /** Where a question is carried to, when it still shows there; else undefined. */
    const carriedTarget = async (story: Doc<"story">): Promise<PlaceRef | undefined> => {
      if (!carry || story.nextQuestionFor === undefined) return undefined;
      const target = await otherPlace(story.nextQuestionFor);
      return target !== null && isPublicRealPlace(target)
        ? await placeRefOf(ctx, target)
        : undefined;
    };
    const answerOf = async (story: Doc<"story">): Promise<Infer<typeof answerView> | undefined> => {
      const { answers } = story;
      if (answers === undefined) return undefined;
      if (answers.kind === "starter") return { kind: "starter", key: answers.key };
      const asked = await ctx.db.get("story", answers.storyId);
      if (asked === null || asked.nextQuestion === undefined) return undefined;
      const here = asked.placeId === placeId;
      if (here ? !isStoryShown(place, asked) || asked.nextQuestionFor !== undefined : !carry)
        return undefined;
      let from: PlaceRef | undefined;
      if (!here) {
        const source = await otherPlace(asked.placeId);
        if (asked.nextQuestionFor !== placeId || !carriedQuestionShown(source, asked))
          return undefined;
        from = await placeRefOf(ctx, source!);
      }
      return {
        kind: "story",
        text: asked.nextQuestion,
        lang: asked.lang,
        askedBy: await nameOf(asked.authorPersonId),
        ...(from === undefined ? {} : { from }),
      };
    };
    const views = [];
    for (const { story, author, addedByMe } of shown) {
      const answers = relay ? await answerOf(story) : undefined;
      // A question addressed elsewhere is shown as such, or not at all: it is nobody's question
      // here once "three doors" is off or its place has left the map.
      const carriedTo = relay ? await carriedTarget(story) : undefined;
      const question =
        relay && story.nextQuestion !== undefined
          ? story.nextQuestionFor === undefined || carriedTo !== undefined
            ? story.nextQuestion
            : undefined
          : undefined;
      views.push({
        _id: story._id,
        body: story.body,
        lang: story.lang,
        authorName: author.name,
        authorKey: author.key,
        addedAt: story._creationTime,
        isMock: story.isMock,
        addedByMe,
        canRemove: addedByMe || canEditPlace(viewer, place),
        photos: await storyPhotoViews(ctx, story._id, addedByMe, photoRules),
        connectorAllowed: story.connectorAllowedAt !== undefined,
        firstTeller: relay && story._id === firstId,
        ...(question === undefined ? {} : { nextQuestion: question }),
        ...(question === undefined || carriedTo === undefined
          ? {}
          : { nextQuestionFor: carriedTo }),
        ...(answers === undefined ? {} : { answers }),
      });
    }
    return views;
  },
});

/**
 * The places a question written at this place could be carried to: the nearest 50 real places on
 * the public map within CARRY_MAX_METRES, nearest first. It takes a place, never a position, and
 * reads no viewer, so everyone gets the same list. Empty while "three doors" is off, or when this
 * place is not itself a real public place with a pin.
 */
export const carryTargets = query({
  args: { placeId: v.id("place") },
  returns: v.array(
    v.object({
      placeId: v.id("place"),
      slug: v.string(),
      names: v.array(nameView),
      metres: v.number(),
    }),
  ),
  handler: async (ctx, { placeId }) => {
    const place = await ctx.db.get("place", placeId);
    if (place === null) return [];
    const region = regionConfig(place.regionId);
    if (!threadOn(region.features)) return [];
    const here = await toPoolPlace(ctx, region, place);
    if (here === null) return [];
    const pool = await publicPool(ctx, place.regionId);
    return nearestCarryTargets(here, pool).map(({ id, slug, names, metres }) => ({
      placeId: id,
      slug,
      names,
      metres,
    }));
  },
});

/**
 * Questions carried to this place from other places, newest first, at most five: each with the
 * writer's words and name and where it was written. Only shown stories from places that are still
 * real places on the public map. Empty while "three doors" is off. Everyone gets the same
 * questions; only `canRemove` depends on who is asking.
 */
export const carriedTo = query({
  args: { placeId: v.id("place") },
  returns: v.array(
    v.object({
      storyId: v.id("story"),
      text: v.string(),
      lang: v.string(),
      askedBy: v.string(),
      from: placeRef,
      addedAt: v.number(),
      /** The viewer may take the question off (stories.clearQuestion): its writer, either place's editor or a steward. */
      canRemove: v.boolean(),
    }),
  ),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return [];
    if (!threadOn(regionConfig(place.regionId).features)) return [];
    const carried = await ctx.db
      .query("story")
      .withIndex("by_nextQuestionFor_and_status", (q) =>
        q.eq("nextQuestionFor", placeId).eq("status", "live"),
      )
      .order("desc")
      .take(CARRIED_SCAN);
    const rows = [];
    for (const story of carried) {
      if (rows.length >= CARRIED_SHOWN_LIMIT) break;
      const source = await ctx.db.get("place", story.placeId);
      if (source === null || !carriedQuestionShown(source, story)) continue;
      rows.push({
        storyId: story._id,
        text: story.nextQuestion!,
        lang: story.lang,
        askedBy: (await ctx.db.get("person", story.authorPersonId))?.displayName ?? "",
        from: await placeRefOf(ctx, source),
        addedAt: story._creationTime,
        canRemove:
          viewer !== null &&
          (story.authorPersonId === viewer._id ||
            canEditPlace(viewer, place) ||
            canEditPlace(viewer, source)),
      });
    }
    return rows;
  },
});

const latestEntry = v.object({
  kind: v.union(v.literal("written"), v.literal("post")),
  id: v.string(),
  placeSlug: v.string(),
  placeNames: v.array(
    v.object({
      lang: v.string(),
      script: scriptValidator,
      value: v.string(),
      isPrimary: v.boolean(),
    }),
  ),
  /**
   * A written story, or the member's own line about a post they shared; never the post itself, apart
   * from the short verbatim quote of a post the story finder found.
   */
  text: v.optional(v.string()),
  lang: v.optional(v.string()),
  platform: v.optional(v.string()),
  /** The member who shared it, or for a found post its author as the platform shows them. */
  sharedBy: v.string(),
  /** The story finder found it in a public post. */
  found: v.optional(v.boolean()),
  /** A found post's quote in other languages, without any the translation check holds back. */
  translations: v.optional(v.array(v.object({ lang: v.string(), text: v.string() }))),
  addedAt: v.number(),
});

/**
 * The newest stories people shared about real places in the region, for the home page (FR-033):
 * written ones and linked posts together, newest first, each with the member's name. Only what
 * everyone may read, the same for every viewer; demo content stays with the walkthrough.
 */
export const latest = query({
  args: { regionId: v.string() },
  returns: v.array(latestEntry),
  handler: async (ctx, { regionId }) => {
    const places = new Map<Id<"place">, Doc<"place"> | null>();
    async function readable(placeId: Id<"place">) {
      if (!places.has(placeId)) {
        const place = await ctx.db.get("place", placeId);
        const ok =
          place !== null &&
          place.regionId === regionId &&
          isPubliclyReadablePlace(place) &&
          !place.isMock;
        places.set(placeId, ok ? place : null);
      }
      return places.get(placeId) ?? null;
    }
    async function nameOf(personId: Id<"person">) {
      return (await ctx.db.get("person", personId))?.displayName ?? "";
    }
    const entries: Infer<typeof latestEntry>[] = [];
    const written = await ctx.db
      .query("story")
      .withIndex("by_status", (q) => q.eq("status", "live"))
      .order("desc")
      .take(LATEST_SCAN);
    for (const story of written) {
      const place = await readable(story.placeId);
      if (place === null || !isStoryShown(place, story)) continue;
      entries.push({
        kind: "written",
        id: story._id,
        placeSlug: place.slug,
        placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
        text: story.body,
        lang: story.lang,
        sharedBy: await nameOf(story.authorPersonId),
        addedAt: story._creationTime,
      });
    }
    // Members' posts and found posts are read apart, so a batch of found posts never pushes the
    // members' out of the scan. A found tip stays on its place's page: this list is for stories.
    const shared = await ctx.db
      .query("source")
      .withIndex("by_status_and_origin_and_sharedAt", (q) =>
        q.eq("status", "live").eq("origin", undefined).gte("sharedAt", 0),
      )
      .order("desc")
      .take(LATEST_SCAN);
    const found = await ctx.db
      .query("source")
      .withIndex("by_status_and_origin_and_foundKind_and_sharedAt", (q) =>
        q
          .eq("status", "live")
          .eq("origin", "story_finder")
          .eq("foundKind", "story")
          .gte("sharedAt", 0),
      )
      .order("desc")
      .take(LATEST_SCAN);
    let foundShown = 0;
    for (const source of [...shared, ...found]) {
      const isFound = source.origin === "story_finder";
      if (isFound && foundShown >= LATEST_FOUND_LIMIT) break;
      if (hasNoCard(source)) continue;
      const place = await readable(source.placeId);
      if (place === null || !isSharedPublicly(place, source)) continue;
      if (isFound) foundShown++;
      entries.push({
        kind: "post",
        id: source._id,
        placeSlug: place.slug,
        placeNames: place.mapNames ?? (await readMapNames(ctx, place._id)),
        text: isFound ? source.excerpt : source.creatorNote,
        lang: isFound ? source.excerptLang : source.noteLang,
        platform: source.platform,
        sharedBy: isFound ? (source.authorHandle ?? "") : await nameOf(source.addedBy),
        ...(isFound ? { found: true, translations: await excerptTranslations(ctx, source) } : {}),
        addedAt: source.sharedAt ?? source._creationTime,
      });
    }
    return entries.sort((a, b) => b.addedAt - a.addedAt).slice(0, LATEST_LIMIT);
  },
});

/**
 * Takes the question off a story, leaving the story. The writer may, and so may whoever may remove
 * the story (the place's editor or a steward). For a question carried to another place, that place's
 * editor may too. It is never refused for walk mode or the thread switch being off.
 */
export const clearQuestion = mutation({
  args: { storyId: v.id("story") },
  returns: v.null(),
  handler: async (ctx, { storyId }) => {
    const person = await requirePerson(ctx);
    const story: Doc<"story"> | null = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    const target =
      story.nextQuestionFor === undefined ? null : await ctx.db.get("place", story.nextQuestionFor);
    const targetEditor = target !== null && canEditPlace(person, target);
    if (story.authorPersonId !== person._id && !targetEditor) {
      const place = await loadReadablePlace(ctx, person, story.placeId);
      if (!canEditPlace(person, place))
        throw appError(
          "forbidden",
          "only the writer, the place's editor, the editor of the place it is carried to or a steward may remove a question",
        );
    }
    if (story.nextQuestion === undefined) return null;
    // The question and where it was carried go together.
    await ctx.db.patch("story", storyId, { nextQuestion: undefined, nextQuestionFor: undefined });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: person._id,
      action: "story.question_cleared",
      targetType: "story",
      targetId: storyId,
      diff: {
        nextQuestion: false,
        ...(story.nextQuestionFor === undefined ? {} : { nextQuestionFor: false }),
      },
    });
    return null;
  },
});

/** The writer takes their story down at any time; the place's editor or a steward may too. */
export const remove = mutation({
  args: { storyId: v.id("story") },
  returns: v.null(),
  handler: async (ctx, { storyId }) => {
    const person = await requirePerson(ctx);
    const story: Doc<"story"> | null = await ctx.db.get("story", storyId);
    if (story === null) throw appError("not_found", "story not found");
    if (story.authorPersonId !== person._id) {
      const place = await loadReadablePlace(ctx, person, story.placeId);
      if (!canEditPlace(person, place))
        throw appError(
          "forbidden",
          "only the writer, the place's editor or a steward may remove it",
        );
    }
    if (story.status === "hidden") return null;
    await ctx.db.patch("story", storyId, { status: "hidden" });
    await removeStoryPhotos(ctx, storyId);
    if (person.role === "steward" && story.authorPersonId !== person._id)
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "story.remove",
        targetType: "story",
        targetId: storyId,
      });
    return null;
  },
});
