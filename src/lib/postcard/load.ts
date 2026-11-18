import { fetchQuery } from "convex/nextjs";
import { connection } from "next/server";
import { cache } from "react";
import { api } from "../../../convex/_generated/api";
import { getActiveRegion } from "../region";
import { isPostcardCode } from "./rules";

/**
 * One card as a signed-out visitor reads it, for the page and its `<head>`. Read at request time and
 * never cached beyond the request, so a deleted card, or a story its writer removed, is gone from the
 * next response. Null for a wrong code, a deleted card, a switched-off feature, and when Convex can't
 * be reached (the page then answers not found rather than showing something stale).
 */
export const loadPostcard = cache(async (code: string) => {
  if (!getActiveRegion().features.postcard || !isPostcardCode(code)) return null;
  // Outside the try, so the prerender's own stop signal reaches React instead of being logged.
  await connection();
  try {
    return await fetchQuery(api.postcards.view, { code });
  } catch (error) {
    console.warn(`postcard not read (${error instanceof Error ? error.name : typeof error})`);
    return null;
  }
});
