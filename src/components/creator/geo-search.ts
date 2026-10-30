import { z } from "zod";

const suggestionSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  provider: z.literal("nominatim"),
  attribution: z.array(z.string().min(1)).min(1),
});
const responseSchema = z.object({ suggestions: z.array(suggestionSchema).max(5) });
export type GeoSuggestion = z.infer<typeof suggestionSchema>;
export type GeoSearchOutcome =
  | { ok: true; suggestions: GeoSuggestion[] }
  | {
      ok: false;
      kind:
        "empty" | "too_long" | "signed_out" | "forbidden" | "busy" | "unavailable" | "bad_response";
    };

export async function searchPlaces(
  q: string,
  lang: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeoSearchOutcome> {
  if (!q.trim()) return { ok: false, kind: "empty" };
  if (q.length > 200) return { ok: false, kind: "too_long" };
  try {
    const response = await fetchImpl(
      `/api/geo/search?${new URLSearchParams({ q: q.trim(), lang })}`,
      {
        method: "GET",
        credentials: "same-origin",
      },
    );
    if (response.status !== 200) {
      const kind =
        response.status === 401
          ? "signed_out"
          : response.status === 403
            ? "forbidden"
            : response.status === 429
              ? "busy"
              : "unavailable";
      return { ok: false, kind };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, kind: "bad_response" };
    }
    const result = responseSchema.safeParse(body);
    return result.success
      ? { ok: true, suggestions: result.data.suggestions }
      : { ok: false, kind: "bad_response" };
  } catch {
    return { ok: false, kind: "unavailable" };
  }
}
