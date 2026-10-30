import type { RegisteredAdapter } from "./index";
import { cleanUrl, parsedUrl, requireMatch } from "./url";

export const linkCardAdapter: RegisteredAdapter = {
  id: "link_card",
  frameHosts: [],
  policy: { storesContent: false, aiAllowed: false, scriptHosts: [] },
  matches: (input) => parsedUrl(input) !== null,
  describe(input) {
    const url = cleanUrl(requireMatch(input, linkCardAdapter.matches));
    return { platform: "web", canonicalUrl: url, embed: { kind: "link", url } };
  },
  author: () => null,
  liveness: async () => "unknown",
};
