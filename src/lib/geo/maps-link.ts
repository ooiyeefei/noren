import { geoUserAgent } from ".";

/**
 * `exact` is true when the point is the place's own pin or a dropped pin, and false when the link
 * only gives the centre of the map view, which can be hundreds of metres from the place.
 */
export type MapsSuggestion = { name?: string; lat: number; lng: number; exact?: boolean };

export function isAllowedMapsHost(input: string | URL): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (url.hostname === "maps.app.goo.gl") return true;
    return (
      ["goo.gl", "www.google.com", "google.com", "maps.google.com"].includes(url.hostname) &&
      url.pathname.startsWith("/maps")
    );
  } catch {
    return false;
  }
}

function coordinates(latText: string, lngText: string) {
  const lat = Number(latText);
  const lng = Number(lngText);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : {};
}

export function parseMapsUrl(finalUrl: string): {
  name?: string;
  lat?: number;
  lng?: number;
  exact?: boolean;
} {
  try {
    const url = new URL(finalUrl);
    const decode = (text: string) => decodeURIComponent(text.replaceAll("+", " ")).trim();
    const path = url.pathname.match(/\/maps\/place\/([^/]+)/)?.[1];
    const query = url.searchParams.get("q")?.trim();
    const name = path ? decode(path) : query;
    const numeric = /^[\d\s.,+\-]+$/;
    const result = name && !numeric.test(name) ? { name } : {};
    const number = "(-?\\d+(?:\\.\\d+)?)";
    const pin = finalUrl.match(new RegExp(`!3d${number}!4d${number}(?=[!&#/?]|$)`));
    const viewport = url.pathname.match(new RegExp(`@${number},${number}(?=[,/]|$)`));
    const q = query?.match(new RegExp(`^${number}\\s*,\\s*${number}$`));
    // The view's centre is the last resort: Google shifts it to make room for its side panel.
    const point = pin ?? q ?? viewport;
    const spot = point ? coordinates(point[1]!, point[2]!) : {};
    return { ...result, ...spot, ...("lat" in spot ? { exact: point !== viewport } : {}) };
  } catch {
    return {};
  }
}

export async function resolveMapsLink(options: {
  url: string;
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
  env?: Readonly<Record<string, string | undefined>>;
}): Promise<{ ok: true; finalUrl: string } | { ok: false; reason: string }> {
  const failure = (reason: string) => ({ ok: false as const, reason });
  const userAgent = geoUserAgent(options.env ?? process.env);
  if (!userAgent)
    return failure("Maps link lookup is not configured: GEO_USER_AGENT is missing or invalid.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    let url = options.url;
    for (let hops = 0; ; hops++) {
      if (!isAllowedMapsHost(url)) return failure("Use an allowed HTTPS Google Maps link.");
      const request = async (method: "HEAD" | "GET") => {
        const response = await options.fetch(url, {
          method,
          redirect: "manual",
          credentials: "omit",
          headers: { "User-Agent": userAgent },
          signal: controller.signal,
        });
        // Headers and URL text are all we use; never consume Google page content.
        await response.body?.cancel();
        return response;
      };
      let response = await request("HEAD");
      if (response.status === 405 || response.status === 501) response = await request("GET");
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (hops >= 3) return failure("The Maps link has too many redirects (maximum 3).");
        const location = response.headers.get("location");
        if (!location) return failure("The Maps link redirect has no destination.");
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok) return failure("The Maps link could not be resolved. Try another link.");
      return { ok: true, finalUrl: url };
    }
  } catch {
    return failure(
      controller.signal.aborted
        ? "Maps link lookup timed out. Try again."
        : "The Maps link could not be resolved. Try another link.",
    );
  } finally {
    clearTimeout(timer);
  }
}
