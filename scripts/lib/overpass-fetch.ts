import { createHash } from "node:crypto";
import { geoUserAgent } from "../../src/lib/geo";

export function overpassCacheKey(options: {
  region: string;
  date: string;
  endpoint: string;
  query: string;
}): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([options.endpoint, options.query]))
    .digest("hex")
    .slice(0, 8);
  return `${options.region}-${options.date}-${hash}.json`;
}

export const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
export function httpsEndpoint(endpoint: string): string {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("Overpass endpoint must be an https URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Overpass endpoint must be https without credentials or fragment");
  return url.href;
}

// Serialize calls in this process, including retries. The CLI additionally locks its daily cache.
let tail: Promise<void> = Promise.resolve();
export async function fetchOverpass(options: {
  query: string;
  endpoint: string;
  userAgent: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
}): Promise<unknown> {
  const endpoint = httpsEndpoint(options.endpoint);
  const userAgent = geoUserAgent({ GEO_USER_AGENT: options.userAgent });
  if (!userAgent) throw new Error("A valid GEO_USER_AGENT is required");
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  let cooldown = 1_000;
  try {
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const response = await options.fetch(endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(200_000),
          headers: { "User-Agent": userAgent, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: options.query }).toString(),
        });
        cooldown = response.status === 429 || response.status === 406 ? 30_000 : 1_000;
        if (response.ok) {
          const json: unknown = await response.json();
          if (
            !json ||
            typeof json !== "object" ||
            !("elements" in json) ||
            !Array.isArray(json.elements) ||
            ("remark" in json && json.remark)
          )
            throw new Error("Overpass returned incomplete or invalid JSON data");
          return json;
        }
        if (![429, 406].includes(response.status) && response.status < 500)
          throw new Error(`Overpass HTTP ${response.status}; request refused`);
        if (attempt === 3)
          throw new Error(`Overpass HTTP ${response.status}; gave up after 3 retries`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Overpass")) throw error;
        if (attempt === 3)
          throw new Error("Overpass request failed after 3 retries", { cause: error });
      }
      await options.sleep(30_000);
    }
    throw new Error("Overpass request failed");
  } finally {
    // A regular-use budget is 100 queries/day; the daily cache normally uses one.
    try {
      await options.sleep(cooldown);
    } finally {
      release();
    }
  }
}
