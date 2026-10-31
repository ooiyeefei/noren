import { auth } from "@clerk/nextjs/server";
import { requirePersonOnServer } from "@/lib/convex/server";
import { isAllowedMapsHost, parseMapsUrl, resolveMapsLink } from "@/lib/geo/maps-link";
import { jsonError } from "@/lib/http/handler";

// Accept per-instance limits; upgrade to a shared Convex limiter when traffic grows.
const lastCalls = new Map<string, number>();

export async function GET(request: Request): Promise<Response> {
  try {
    // Any signed-in member may add a missing place from a Maps link (FR-032).
    const authorization = await requirePersonOnServer();
    if (!authorization.ok) return authorization.response;
    const url = new URL(request.url).searchParams.get("url");
    if (!url || url.length > 500 || !isAllowedMapsHost(url)) {
      return jsonError(
        "invalid_input",
        "Paste an HTTPS Google Maps link of at most 500 characters.",
      );
    }
    const now = Date.now();
    const { userId: user } = await auth();
    if (!user) return jsonError("unauthenticated", "Sign in to fill from a Maps link.");
    const lastCall = lastCalls.get(user);
    if (lastCall !== undefined && now - lastCall < 1000) {
      return jsonError("rate_limited", "Wait one second before filling from another link.", {
        headers: { "Retry-After": "1" },
      });
    }
    for (const [key, time] of lastCalls) if (now - time >= 1000) lastCalls.delete(key);
    lastCalls.set(user, now);
    const result = await resolveMapsLink({ url, fetch: globalThis.fetch });
    if (!result.ok) return jsonError("invalid_input", result.reason);
    const suggestion = parseMapsUrl(result.finalUrl);
    if (suggestion.lat === undefined || suggestion.lng === undefined) {
      const response = jsonError(
        "invalid_input",
        "No coordinates were found in this link. Place the pin on the map or try another link.",
      );
      return new Response(response.body, { status: 422, headers: response.headers });
    }
    return Response.json(
      { suggestion, source: "the link you pasted" },
      {
        headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
      },
    );
  } catch {
    return jsonError("internal", "Maps link lookup is unavailable. Try again.");
  }
}
