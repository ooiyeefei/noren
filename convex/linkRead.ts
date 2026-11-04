"use node";

import { lookup } from "node:dns/promises";
import { v } from "convex/values";
import { createLanguageModel } from "../src/lib/ai/claim-extractor";
import { aiConfig } from "../src/lib/ai/config";
import { createNoteDrafter } from "../src/lib/link-read/draft";
import { readLink } from "../src/lib/link-read/read";
import type { LinkRead, NoteDraft } from "../src/lib/link-read/types";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const resolveHost = async (hostname: string) =>
  (await lookup(hostname, { all: true })).map(({ address }) => address);

/** Logs say which step failed and why, never the link or a post's words. */
function logFailure(step: string, failure: string | undefined) {
  if (failure) console.error(`${step} failed: ${failure}`);
}

/**
 * What a member sees under the link they just pasted. It reads the link on every call and keeps
 * nothing: sharing still goes through sources.add, which stores what the member's form sends.
 */
export const previewLink = action({
  args: { placeId: v.id("place"), url: v.string() },
  returns: v.object({
    outcome: v.union(v.literal("read"), v.literal("embed_only"), v.literal("unread")),
    title: v.optional(v.string()),
    caption: v.optional(v.string()),
    author: v.optional(v.string()),
    authorUrl: v.optional(v.string()),
    siteName: v.optional(v.string()),
    failure: v.optional(v.string()),
  }),
  handler: async (ctx, { placeId, url }): Promise<LinkRead> => {
    const { adapters } = await ctx.runMutation(internal.sources.beginLinkRead, {
      placeId,
      kind: "preview",
    });
    const read = await readLink(url, adapters, { lookup: resolveHost });
    logFailure("link preview", read.failure);
    return read;
  },
});

/**
 * Drafts the member's line from their own post. `mine` is the tick in the form: without it this is
 * refused before anything runs. It reads the link again here, so it takes no text from the caller
 * and cannot be used to send anything else to the model. Nothing is shared until they press Share.
 */
export const draftNote = action({
  args: {
    placeId: v.id("place"),
    url: v.string(),
    lang: v.string(),
    mine: v.literal(true),
  },
  returns: v.object({ note: v.union(v.string(), v.null()), failure: v.optional(v.string()) }),
  handler: async (ctx, { placeId, url, lang }): Promise<NoteDraft> => {
    const { adapters, locales, placeNames } = await ctx.runMutation(
      internal.sources.beginLinkRead,
      { placeId, kind: "draft" },
    );
    const config = aiConfig("write_story", process.env);
    if (!config.ok) {
      console.error(`note draft stopped: ${config.reason}`);
      return { note: null, failure: "NotConfigured" };
    }
    const read = await readLink(url, adapters, { lookup: resolveHost });
    if (!read.caption && !read.title) {
      logFailure("note draft", read.failure);
      return { note: null, failure: read.failure ?? "NothingToRead" };
    }
    const language = locales.includes(lang) ? lang : (locales[0] ?? "en");
    const draft = await createNoteDrafter({ model: createLanguageModel(config.config) }).draft({
      placeName: (placeNames.find((name) => name.lang === language) ?? placeNames[0])?.value,
      lang: language,
      title: read.title,
      text: read.caption,
    });
    logFailure("note draft", draft.failure);
    return draft;
  },
});
