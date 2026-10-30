import type { RegisteredAdapter } from "./index";
import { parsedUrl, requireMatch } from "./url";

function video(input: string): { user: string; id: string } | null {
  const url = parsedUrl(input);
  if (!url || !["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(url.hostname)) return null;
  const match = /^\/@([A-Za-z0-9_.]+)\/video\/(\d+)\/?$/.exec(url.pathname);
  return match ? { user: match[1]!.toLowerCase(), id: match[2]! } : null;
}

export const tiktokAdapter: RegisteredAdapter = {
  id: "tiktok",
  frameHosts: ["https://www.tiktok.com"],
  policy: { storesContent: false, aiAllowed: false, scriptHosts: [] },
  matches: (input) => video(input) !== null,
  describe(input) {
    requireMatch(input, tiktokAdapter.matches);
    const { user, id } = video(input)!;
    return {
      platform: "tiktok",
      canonicalUrl: `https://www.tiktok.com/@${user}/video/${id}`,
      embed: { kind: "iframe", url: `https://www.tiktok.com/player/v1/${id}` },
    };
  },
  author(input) {
    const user = video(input)?.user;
    return user ? { handle: `@${user}`, url: `https://www.tiktok.com/@${user}` } : null;
  },
  liveness: async () => "unknown",
};
