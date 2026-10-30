import type { RegisteredAdapter } from "./index";
import { fetchStatus, parsedUrl, requireMatch } from "./url";

function videoId(input: string): string | null {
  const url = parsedUrl(input);
  if (!url) return null;
  let id: string | null = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    id = /^\/watch\/?$/.test(url.pathname)
      ? url.searchParams.get("v")
      : (/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] ?? null);
  } else if (url.hostname === "youtu.be") {
    id = /^\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
    id = /^\/embed\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export const youtubeAdapter: RegisteredAdapter = {
  id: "youtube",
  frameHosts: ["https://www.youtube-nocookie.com"],
  policy: { storesContent: false, aiAllowed: false, scriptHosts: [] },
  matches: (input) => videoId(input) !== null,
  describe(input) {
    requireMatch(input, youtubeAdapter.matches);
    const id = videoId(input)!;
    return {
      platform: "youtube",
      canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
      embed: { kind: "iframe", url: `https://www.youtube-nocookie.com/embed/${id}` },
    };
  },
  author: () => null,
  async liveness(input) {
    if (!youtubeAdapter.matches(input)) return "unknown";
    const { canonicalUrl } = youtubeAdapter.describe(input);
    const status = await fetchStatus(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`,
    );
    if (status === 200) return "live";
    // oEmbed's Not Found/Gone is conclusive; auth and cloud-IP blocks are not.
    return status === 404 || status === 410 ? "gone" : "unknown";
  },
};
