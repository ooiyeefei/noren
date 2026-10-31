import { fetchMutation, fetchQuery } from "convex/nextjs";
import { isCountedVisit } from "@/lib/http/outbound";
import { api } from "../../../../convex/_generated/api";

const HEADERS = { "Cache-Control": "no-store" };

/**
 * A link out of Noren to a shared post's original (FR-024): counts a person's visit for the day,
 * then sends them on. No cookie is set and nothing about the visitor is stored. The original sees
 * only that the visit came from Noren, which is the referral the creator gets.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  const { sourceId } = await params;
  let url: string | null;
  try {
    url = isCountedVisit(request.method, request.headers)
      ? await fetchMutation(api.links.follow, { sourceId })
      : await fetchQuery(api.links.peek, { sourceId });
  } catch (error) {
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`out ${sourceId}: ${name}: ${message || "(no message)"}`);
    return new Response("Could not open the post. Go back and try again.", {
      status: 503,
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (url === null)
    return new Response("This post is no longer shown on Noren.", {
      status: 404,
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  return new Response(null, {
    status: 307,
    headers: { ...HEADERS, Location: url, "Referrer-Policy": "origin" },
  });
}
