import { v, type Infer } from "convex/values";
import { describeSource, embedFor } from "../src/lib/adapters";
import { SOURCE_ADAPTER_IDS, SOURCE_STATUSES } from "../src/lib/domain/constants";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import {
  canEditPlace,
  canSeeSource,
  isSourceShownToEveryone,
  loadReadablePlace,
  type Viewer,
} from "./lib/access";
import { writeAudit } from "./lib/audit";
import { currentPerson, requirePerson, requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { withMock } from "./lib/mock";
import { limitContribution } from "./lib/rateLimit";
import { isRegionLocale, regionConfig } from "./lib/region";
import { literals, sourceStatusValidator } from "./lib/validators";
import { canReadPlace } from "./lib/visibility";

export const embedDescriptorValidator = v.union(
  v.object({ kind: v.literal("link"), url: v.string(), placeId: v.optional(v.string()) }),
  v.object({ kind: v.literal("blockquote"), url: v.string(), scriptUrl: v.string() }),
  v.object({ kind: v.literal("iframe"), url: v.string() }),
);

const sourceViewValidator = v.object({
  _id: v.id("source"),
  placeId: v.id("place"),
  adapter: literals(SOURCE_ADAPTER_IDS),
  platform: v.string(),
  url: v.string(),
  canonicalUrl: v.string(),
  embed: embedDescriptorValidator,
  title: v.optional(v.string()),
  authorHandle: v.optional(v.string()),
  authorUrl: v.optional(v.string()),
  postedAt: v.optional(v.number()),
  creatorNote: v.optional(v.string()),
  noteLang: v.optional(v.string()),
  status: sourceStatusValidator,
  hasDemoConsent: v.boolean(),
  isMock: v.boolean(),
  addedByMe: v.boolean(),
  /** The name of the member who linked it, once they agreed to show it (FR-033). */
  sharedBy: v.optional(v.string()),
  addedAt: v.number(),
  /** Whether everyone may see it, so a visit to the original is counted through /out (FR-024). */
  shownToEveryone: v.boolean(),
});
export type SourceView = Infer<typeof sourceViewValidator>;

async function sourceView(
  ctx: QueryCtx,
  place: Doc<"place">,
  source: Doc<"source">,
  viewer: Viewer,
): Promise<SourceView> {
  const adapter = SOURCE_ADAPTER_IDS.find((id) => id === source.adapter);
  if (adapter === undefined) throw appError("invalid_input", "unknown source adapter");
  return {
    _id: source._id,
    placeId: source.placeId,
    adapter,
    platform: source.platform,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    embed: embedFor(adapter, source.canonicalUrl),
    title: source.title,
    authorHandle: source.authorHandle,
    authorUrl: source.authorUrl,
    postedAt: source.postedAt,
    creatorNote: source.creatorNote,
    noteLang: source.noteLang,
    status: source.status,
    hasDemoConsent: source.demoConsentAt !== undefined,
    isMock: source.isMock,
    addedByMe: viewer?._id === source.addedBy,
    sharedBy:
      source.sharedAt === undefined
        ? undefined
        : (await ctx.db.get("person", source.addedBy))?.displayName,
    addedAt: source._creationTime,
    shownToEveryone: isSourceShownToEveryone(place, source),
  };
}

async function loadSource(ctx: QueryCtx, sourceId: Id<"source">) {
  const source = await ctx.db.get("source", sourceId);
  if (source === null) throw appError("not_found", "source not found");
  return source;
}

export const listForPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(sourceViewValidator),
  handler: async (ctx, { placeId }) => {
    const viewer = await currentPerson(ctx);
    const place = await ctx.db.get("place", placeId);
    if (place === null || !(await canReadPlace(ctx, viewer, place))) return [];
    const sources = await ctx.db
      .query("source")
      .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", "live"))
      .take(50);
    const visible: SourceView[] = [];
    for (const source of sources) {
      if (await canSeeSource(ctx, viewer, place, source))
        visible.push(await sourceView(ctx, place, source, viewer));
    }
    return visible;
  },
});

export const listForSteward = query({
  args: { placeId: v.id("place") },
  returns: v.array(sourceViewValidator),
  handler: async (ctx, { placeId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const place = await loadReadablePlace(ctx, steward, placeId);
    const views: SourceView[] = [];
    for (const status of SOURCE_STATUSES) {
      const sources = await ctx.db
        .query("source")
        .withIndex("by_placeId_and_status", (q) => q.eq("placeId", placeId).eq("status", status))
        .take(100);
      for (const source of sources) views.push(await sourceView(ctx, place, source, steward));
    }
    return views;
  },
});

export const add = mutation({
  args: {
    placeId: v.id("place"),
    url: v.string(),
    title: v.optional(v.string()),
    note: v.optional(v.string()),
    noteLang: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    authorUrl: v.optional(v.string()),
    postedAt: v.optional(v.number()),
  },
  returns: v.object({
    sourceId: v.id("source"),
    adapter: literals(SOURCE_ADAPTER_IDS),
    platform: v.string(),
  }),
  handler: async (ctx, args) => {
    // Any signed-in member may link a post about a place they can read (FR-032).
    const person = await requirePerson(ctx);
    const place = await loadReadablePlace(ctx, person, args.placeId);
    const region = regionConfig(place.regionId);
    const described = describeSource(args.url, region.enabledSourceAdapters);
    if (!described.ok) throw appError("invalid_input", `source URL: ${described.reason}`);
    const source = described.source;
    if (source.adapter === "link_card" && !args.title?.trim()) {
      throw appError("invalid_input", "type a title for the link card");
    }
    if (args.title !== undefined && args.title.length > 200)
      throw appError("invalid_input", "title must be at most 200 characters");
    if (args.note !== undefined && args.note.length > 1000)
      throw appError("invalid_input", "note must be at most 1000 characters");
    if (
      (args.note !== undefined && args.noteLang === undefined) ||
      (args.noteLang !== undefined && !isRegionLocale(region, args.noteLang))
    ) {
      throw appError(
        "invalid_input",
        "noteLang must be a region locale and is required with a note",
      );
    }
    if (args.authorHandle !== undefined && args.authorHandle.length > 100)
      throw appError("invalid_input", "authorHandle must be at most 100 characters");
    if (args.authorUrl !== undefined && args.authorUrl.length > 500)
      throw appError("invalid_input", "authorUrl must be at most 500 characters");
    if (args.authorUrl !== undefined) {
      let valid = false;
      try {
        valid = new URL(args.authorUrl).protocol === "https:";
      } catch {
        /* Invalid URL. */
      }
      if (!valid) throw appError("invalid_input", "authorUrl must be https");
    }
    const existing = await ctx.db
      .query("source")
      .withIndex("by_placeId_and_canonicalUrl", (q) =>
        q.eq("placeId", place._id).eq("canonicalUrl", source.canonicalUrl),
      )
      .first();
    if (existing !== null) throw appError("conflict", "this URL is already attached to the place");
    await limitContribution(ctx, person, "post");
    const sourceId = await ctx.db.insert(
      "source",
      withMock(person, {
        placeId: place._id,
        adapter: source.adapter,
        platform: source.platform,
        url: source.adapter === "google_maps_link" ? source.canonicalUrl : args.url.trim(),
        canonicalUrl: source.canonicalUrl,
        title: args.title,
        // URL-derived credit is only a suggestion; creator-typed fields win.
        authorHandle: args.authorHandle ?? source.author?.handle,
        authorUrl: args.authorUrl ?? source.author?.url,
        postedAt: args.postedAt,
        creatorNote: args.note,
        noteLang: args.noteLang,
        addedBy: person._id,
        status: "live" as const,
        // The add form says the post is shown with the member's line and name (FR-033).
        sharedAt: Date.now(),
      }),
    );
    return { sourceId, adapter: source.adapter, platform: source.platform };
  },
});

export const remove = mutation({
  args: { sourceId: v.id("source") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const person = await requirePerson(ctx);
    const source = await loadSource(ctx, sourceId);
    if (source.addedBy !== person._id) {
      const place = await loadReadablePlace(ctx, person, source.placeId);
      if (!canEditPlace(person, place)) {
        throw appError(
          "forbidden",
          "only the source's creator, a place editor or a steward may remove it",
        );
      }
    }
    await ctx.db.patch("source", sourceId, { status: "hidden" });
    if (person.role === "steward" && source.addedBy !== person._id) {
      await writeAudit(ctx, {
        actorKind: "person",
        actorPersonId: person._id,
        action: "source.remove",
        targetType: "source",
        targetId: sourceId,
      });
    }
    return null;
  },
});

export const markGone = mutation({
  args: { sourceId: v.id("source") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    await loadSource(ctx, sourceId);
    await ctx.db.patch("source", sourceId, { status: "gone" });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "source.mark_gone",
      targetType: "source",
      targetId: sourceId,
    });
    return null;
  },
});

export const recordDemoConsent = mutation({
  args: { sourceId: v.id("source") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const source = await loadSource(ctx, sourceId);
    if (source.demoConsentAt !== undefined) return null;
    await ctx.db.patch("source", sourceId, {
      demoConsentAt: Date.now(),
      demoConsentBy: steward._id,
    });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "source.demo_consent",
      targetType: "source",
      targetId: sourceId,
    });
    return null;
  },
});

export const revokeDemoConsent = mutation({
  args: { sourceId: v.id("source") },
  returns: v.null(),
  handler: async (ctx, { sourceId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const source = await loadSource(ctx, sourceId);
    if (source.demoConsentAt === undefined) return null;
    await ctx.db.patch("source", sourceId, { demoConsentAt: undefined, demoConsentBy: undefined });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "source.demo_consent_revoked",
      targetType: "source",
      targetId: sourceId,
    });
    return null;
  },
});

export const listToCheck = internalQuery({
  args: { limit: v.number() },
  returns: v.array(
    v.object({ sourceId: v.id("source"), adapter: v.string(), canonicalUrl: v.string() }),
  ),
  handler: async (ctx, { limit }) => {
    const capped = Number.isFinite(limit) ? Math.max(0, Math.min(100, Math.floor(limit))) : 100;
    const sources = await ctx.db
      .query("source")
      .withIndex("by_status_and_lastCheckedAt", (q) => q.eq("status", "live"))
      .order("asc")
      .take(capped);
    return sources.map((source) => ({
      sourceId: source._id,
      adapter: source.adapter,
      canonicalUrl: source.canonicalUrl,
    }));
  },
});

export const recordCheck = internalMutation({
  args: {
    sourceId: v.id("source"),
    result: v.union(v.literal("live"), v.literal("gone"), v.literal("unknown")),
  },
  returns: v.null(),
  handler: async (ctx, { sourceId, result }) => {
    const source = await ctx.db.get("source", sourceId);
    if (source === null || source.status !== "live") return null;
    await ctx.db.patch("source", sourceId, {
      lastCheckedAt: Date.now(),
      ...(result === "gone" ? { status: "gone" as const } : {}),
    });
    if (result === "gone") {
      await writeAudit(ctx, {
        actorKind: "system",
        action: "source.gone",
        targetType: "source",
        targetId: sourceId,
      });
    }
    return null;
  },
});
