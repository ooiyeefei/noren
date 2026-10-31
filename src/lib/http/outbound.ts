/** Browsers and frameworks that fetch a link ahead of a click say so in one of these headers. */
const PREFETCH_HEADERS = ["purpose", "sec-purpose", "x-purpose", "x-moz"] as const;
const CRAWLER =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|monitor|curl|wget|python|java\/|go-http/i;

/**
 * Whether a request to /out is a person following the link, and so a visit to count (FR-024).
 * Prefetches, link previews and crawlers are sent on without being counted; so is a request that
 * gives no browser at all. Nothing from the request is stored either way.
 */
export function isCountedVisit(method: string, headers: Headers): boolean {
  if (method !== "GET") return false;
  if (headers.get("next-router-prefetch") !== null) return false;
  if (PREFETCH_HEADERS.some((name) => /prefetch|preview|prerender/i.test(headers.get(name) ?? "")))
    return false;
  const agent = headers.get("user-agent") ?? "";
  return agent !== "" && !CRAWLER.test(agent);
}

/** The path a shared post's "View the original" link takes, so the visit can be counted. */
export function outboundPath(sourceId: string): string {
  return `/out/${encodeURIComponent(sourceId)}`;
}
