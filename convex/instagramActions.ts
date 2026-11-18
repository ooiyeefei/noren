import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  containerStatus,
  createContainer,
  InstagramError,
  latestMedia,
  permalinkOf,
  POLL_DELAYS_MS,
  publishContainer,
  publishingLimit,
  readCredentials,
  sleeper,
  type Credentials,
} from "./lib/instagramApi";
import type { FailureCode } from "../src/lib/share/auto-post";

/** An error's name with a fallback, so a throw that is not an Error still says something. */
function failureName(error: unknown): string {
  return error instanceof Error ? error.name || "Error" : `NonError: ${typeof error}`;
}

async function fail(
  ctx: ActionCtx,
  postId: Id<"instagramPost">,
  code: FailureCode,
  clearContainer = false,
): Promise<void> {
  await ctx.runMutation(internal.instagramPosts.settleFailure, { postId, code, clearContainer });
}

/** Records a published post; its permalink is fetched on a best-effort basis and may follow later. */
async function finish(
  ctx: ActionCtx,
  creds: Credentials,
  postId: Id<"instagramPost">,
  mediaId: string,
  knownPermalink: string | null,
): Promise<void> {
  let permalink = knownPermalink;
  if (permalink === null) {
    try {
      permalink = await permalinkOf(creds, mediaId);
    } catch {
      permalink = null;
    }
  }
  await ctx.runMutation(internal.instagramPosts.recordPosted, { postId, mediaId, permalink });
}

/**
 * Sends one approved story to Instagram: container, wait until FINISHED, publish. The post was moved
 * to "publishing" by `dispatch`. Every step that must not repeat is written down first, so a rerun
 * after a crash or a timeout picks up where it stopped and never posts twice: a container is made
 * once, and before any publish call the container's own status says whether it already went out.
 * The token is read from the environment here and nowhere else; nothing here logs it, and the only
 * thing logged on a failure is an error name.
 */
export const publish = internalAction({
  args: { postId: v.id("instagramPost") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    try {
      const creds = readCredentials(process.env);
      const first = await ctx.runQuery(internal.instagramPosts.forPublish, { postId });
      if (first.kind === "skip") return null;
      if (first.kind === "stop") {
        await ctx.runMutation(internal.instagramPosts.stop, { postId, reason: first.reason });
        return null;
      }
      if (creds === null) return (await fail(ctx, postId, "not_configured"), null);

      let containerId = first.containerId;
      if (first.mediaId !== null) {
        await finish(ctx, creds, postId, first.mediaId, null);
        return null;
      }
      if (containerId === null) {
        const limit = await publishingLimit(creds).catch((error: unknown) => {
          // A failed limit check is not worth stopping for; the publish call enforces it anyway.
          if (error instanceof InstagramError && error.code === "token_invalid") throw error;
          return null;
        });
        if (limit !== null && limit.used >= limit.total) {
          await ctx.runMutation(internal.instagramPosts.deferRateLimited, { postId });
          return null;
        }
        containerId = await createContainer(creds, {
          imageUrl: first.imageUrl,
          caption: first.caption,
        });
        await ctx.runMutation(internal.instagramPosts.recordContainer, { postId, containerId });
      }

      let state = await containerStatus(creds, containerId);
      for (let i = 0; state === "IN_PROGRESS" && i < POLL_DELAYS_MS.length; i++) {
        await sleeper.sleep(POLL_DELAYS_MS[i]!);
        state = await containerStatus(creds, containerId);
      }
      if (state === "IN_PROGRESS") return (await fail(ctx, postId, "timeout"), null);
      if (state === "ERROR") return (await fail(ctx, postId, "container_error", true), null);
      if (state === "EXPIRED") return (await fail(ctx, postId, "container_expired", true), null);

      if (state === "PUBLISHED") {
        // An earlier attempt's publish call went through but was not recorded: find that post.
        const found = await latestMedia(creds);
        if (found === null) return (await fail(ctx, postId, "api_error"), null);
        await finish(ctx, creds, postId, found.id, found.permalink);
        return null;
      }

      // The last check, in its own transaction: a tick turned off or a story removed while the
      // container was processing stops the post here.
      if ((await ctx.runMutation(internal.instagramPosts.claimPublish, { postId })) === "stop")
        return null;
      const mediaId = await publishContainer(creds, containerId);
      await finish(ctx, creds, postId, mediaId, null);
      return null;
    } catch (error) {
      console.error(`instagram post failed: ${failureName(error)}`);
      const code: FailureCode = error instanceof InstagramError ? error.code : "api_error";
      const clear = code === "image_rejected";
      try {
        await fail(ctx, postId, code, clear);
      } catch (inner) {
        console.error(`instagram post state not saved: ${failureName(inner)}`);
      }
      return null;
    }
  },
});
