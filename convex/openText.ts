import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { placeHasOwner } from "./lib/access";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { appError } from "./lib/errors";
import { internalMutation, mutation } from "./lib/gate";
import { licenceValidator } from "./lib/validators";

const snippetView = v.object({
  _id: v.id("openTextSnippet"),
  placeId: v.optional(v.id("place")),
  lang: v.string(),
  text: v.string(),
  licence: licenceValidator,
  sourceUrl: v.string(),
  attribution: v.string(),
  revisionRef: v.optional(v.string()),
  retrievedAt: v.number(),
  approved: v.boolean(),
});
export type SnippetView = Infer<typeof snippetView>;

function view(snippet: Doc<"openTextSnippet">): SnippetView {
  const { _id, placeId, lang, text, licence, sourceUrl, attribution, revisionRef, retrievedAt } =
    snippet;
  return {
    _id,
    placeId,
    lang,
    text,
    licence,
    sourceUrl,
    attribution,
    revisionRef,
    retrievedAt,
    approved: snippet.approvedBy !== undefined,
  };
}

/**
 * Openly licensed text may only become a claim about a pinned landmark a steward confirmed.
 * A real business gets its story from its own owner; the steward screen enforces this too, but
 * the UI is not the boundary.
 */
async function requirePinnedLandmark(ctx: QueryCtx, placeId: Id<"place">): Promise<void> {
  const place = await ctx.db.get("place", placeId);
  if (place === null) throw appError("not_found", "place not found");
  const pin = await ctx.db
    .query("pin")
    .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
    .first();
  if (place.kind !== "landmark" || pin === null) {
    throw appError("conflict", "open text requires a pinned landmark");
  }
}

export const listUnlinked = query({
  args: {},
  returns: v.array(snippetView),
  handler: async (ctx) => {
    await requireRole(ctx, ["steward"]);
    const snippets = await ctx.db
      .query("openTextSnippet")
      .withIndex("by_placeId", (q) => q.eq("placeId", undefined))
      .take(100);
    return snippets.map(view);
  },
});

export const listForPlace = query({
  args: { placeId: v.id("place") },
  returns: v.array(snippetView),
  handler: async (ctx, { placeId }) => {
    await requireRole(ctx, ["steward"]);
    const snippets = await ctx.db
      .query("openTextSnippet")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .take(50);
    return snippets.map(view);
  },
});

export const link = mutation({
  args: { snippetId: v.id("openTextSnippet"), placeId: v.id("place") },
  returns: v.null(),
  handler: async (ctx, { snippetId, placeId }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const snippet = await ctx.db.get("openTextSnippet", snippetId);
    if (snippet === null) throw appError("not_found", "snippet not found");
    await requirePinnedLandmark(ctx, placeId);
    if (snippet.placeId !== undefined && snippet.placeId !== placeId) {
      throw appError("conflict", "snippet is already linked to another place");
    }
    if (await placeHasOwner(ctx, placeId)) {
      throw appError("conflict", "open text is only for places without an owner");
    }
    await ctx.db.patch("openTextSnippet", snippetId, { placeId });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "open_text.link",
      targetType: "openTextSnippet",
      targetId: snippetId,
      diff: { placeId },
    });
    return null;
  },
});

export const approveExcerpts = mutation({
  args: {
    snippetId: v.id("openTextSnippet"),
    excerpts: v.array(
      v.object({
        start: v.number(),
        end: v.number(),
        kind: v.union(v.literal("story"), v.literal("fact")),
      }),
    ),
  },
  returns: v.array(v.id("claim")),
  handler: async (ctx, { snippetId, excerpts }) => {
    const steward = await requireRole(ctx, ["steward"]);
    const snippet = await ctx.db.get("openTextSnippet", snippetId);
    if (snippet === null) throw appError("not_found", "snippet not found");
    const placeId = snippet.placeId;
    if (placeId === undefined) throw appError("conflict", "snippet must be linked first");
    await requirePinnedLandmark(ctx, placeId);
    if (await placeHasOwner(ctx, placeId)) {
      throw appError("conflict", "open text is only for places without an owner");
    }
    if (excerpts.length < 1 || excerpts.length > 20) {
      throw appError("invalid_input", "approve 1 to 20 excerpts at a time");
    }
    for (const { start, end } of excerpts) {
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > snippet.text.length ||
        end - start > 600 ||
        !snippet.text.slice(start, end).trim()
      ) {
        throw appError(
          "invalid_input",
          "excerpt must be a nonblank span of at most 600 characters within the snippet",
        );
      }
    }
    const claimIds = [];
    for (const { start, end, kind } of excerpts) {
      const quote = snippet.text.slice(start, end);
      claimIds.push(
        await ctx.db.insert("claim", {
          placeId,
          kind,
          textOriginal: quote.trim(),
          langOriginal: snippet.lang,
          origin: "open_text",
          sourceOpenTextId: snippetId,
          quote,
          spanStart: start,
          spanEnd: end,
          status: "published",
          reviewerId: steward._id,
          isMock: false,
        }),
      );
    }
    await ctx.db.patch("openTextSnippet", snippetId, { approvedBy: steward._id });
    await writeAudit(ctx, {
      actorKind: "person",
      actorPersonId: steward._id,
      action: "open_text.approve",
      targetType: "openTextSnippet",
      targetId: snippetId,
      diff: { claimIds },
    });
    return claimIds;
  },
});

export const importSnippets = internalMutation({
  args: {
    snippets: v.array(
      v.object({
        lang: v.string(),
        text: v.string(),
        licence: licenceValidator,
        sourceUrl: v.string(),
        attribution: v.string(),
        revisionRef: v.optional(v.string()),
        retrievedAt: v.number(),
      }),
    ),
  },
  returns: v.object({ inserted: v.number(), skipped: v.number() }),
  handler: async (ctx, { snippets }) => {
    if (snippets.length > 50) throw appError("invalid_input", "import at most 50 snippets");
    let inserted = 0;
    let skipped = 0;
    for (const snippet of snippets) {
      const text = snippet.text.trim();
      if (snippet.licence === "ODbL-1.0")
        throw appError("invalid_input", "ODbL is for data, not text");
      if (!text || text.length > 20000)
        throw appError("invalid_input", "text must contain 1 to 20000 characters");
      let url: URL;
      try {
        url = new URL(snippet.sourceUrl);
      } catch {
        throw appError("invalid_input", "sourceUrl must be https");
      }
      if (url.protocol !== "https:") throw appError("invalid_input", "sourceUrl must be https");
      const existing = await ctx.db
        .query("openTextSnippet")
        .withIndex("by_sourceUrl_and_lang", (q) =>
          q.eq("sourceUrl", snippet.sourceUrl).eq("lang", snippet.lang),
        )
        .first();
      if (existing !== null) {
        skipped += 1;
        continue;
      }
      await ctx.db.insert("openTextSnippet", { ...snippet, text });
      inserted += 1;
    }
    await writeAudit(ctx, {
      actorKind: "system",
      action: "open_text.import",
      targetType: "openTextSnippet",
      diff: { inserted, skipped },
    });
    return { inserted, skipped };
  },
});
