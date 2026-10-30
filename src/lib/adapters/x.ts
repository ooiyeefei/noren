import type { RegisteredAdapter } from "./index";
import { fetchStatus, parsedUrl, requireMatch } from "./url";

function post(input: string): { id: string } | null {
  const url = parsedUrl(input);
  if (
    !url ||
    ![
      "x.com",
      "www.x.com",
      "mobile.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
    ].includes(url.hostname)
  )
    return null;
  // Accept our /i/status canonical form as well as the pasted /i/web/status form.
  const anonymous = /^\/i\/(?:web\/)?status\/(\d+)\/?$/.exec(url.pathname);
  if (anonymous) return { id: anonymous[1]! };
  const named = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/.exec(url.pathname);
  return named ? { id: named[2]! } : null;
}

export const xAdapter: RegisteredAdapter = {
  id: "x",
  frameHosts: ["https://platform.twitter.com"],
  policy: { storesContent: false, aiAllowed: false, scriptHosts: ["https://platform.twitter.com"] },
  matches: (input) => post(input) !== null,
  describe(input) {
    requireMatch(input, xAdapter.matches);
    const { id } = post(input)!;
    const url = `https://x.com/i/status/${id}`;
    return {
      platform: "x",
      canonicalUrl: url,
      embed: { kind: "blockquote", url, scriptUrl: "https://platform.twitter.com/widgets.js" },
    };
  },
  // X ignores the path's handle, so it cannot suggest an author safely.
  author: () => null,
  async liveness(input) {
    if (!xAdapter.matches(input)) return "unknown";
    const { canonicalUrl } = xAdapter.describe(input);
    const status = await fetchStatus(
      `https://publish.x.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(canonicalUrl)}`,
    );
    return status === 200 ? "live" : status === 404 ? "gone" : "unknown";
  },
};
