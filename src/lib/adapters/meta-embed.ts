import type { RegisteredAdapter } from "./index";
import type { EmbedDescriptor } from "../ports";
import { parsedUrl, requireMatch } from "./url";

type MetaPost = {
  platform: "instagram" | "facebook" | "threads";
  canonicalUrl: string;
  video?: boolean;
  user?: string;
};

function metaPost(input: string): MetaPost | null {
  const url = parsedUrl(input);
  if (!url) return null;
  if (["instagram.com", "www.instagram.com"].includes(url.hostname)) {
    const match = /^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    return match
      ? {
          platform: "instagram",
          // Research does not verify that /reel and /p are interchangeable.
          canonicalUrl: `https://www.instagram.com/${match[1]}/${match[2]}`,
        }
      : null;
  }
  if (["threads.com", "www.threads.com", "threads.net", "www.threads.net"].includes(url.hostname)) {
    const named = /^\/@([A-Za-z0-9_.]+)\/post\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    const short = /^\/t\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
    if (named)
      return {
        platform: "threads",
        canonicalUrl: `https://www.threads.com/@${named[1]!.toLowerCase()}/post/${named[2]}`,
        user: named[1]!.toLowerCase(),
      };
    return short
      ? { platform: "threads", canonicalUrl: `https://www.threads.com/t/${short[1]}` }
      : null;
  }
  if (
    !["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"].includes(
      url.hostname,
    )
  )
    return null;
  const page = /^\/([A-Za-z0-9_.-]+)\/(posts|videos)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  const reel = /^\/reel\/(\d+)\/?$/.test(url.pathname);
  const share = /^\/share\/(p|v)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  const watch = /^\/watch\/?$/.test(url.pathname) && !!url.searchParams.get("v");
  const permalink =
    url.pathname === "/permalink.php" &&
    !!url.searchParams.get("story_fbid") &&
    !!url.searchParams.get("id");
  if (!page && !reel && !share && !watch && !permalink) return null;
  const path = page
    ? `/${page[1]!.toLowerCase()}/${page[2]}/${page[3]}`
    : url.pathname.replace(/\/+$/, "");
  const canonical = new URL(`https://www.facebook.com${path}`);
  for (const key of watch ? ["v"] : permalink ? ["story_fbid", "id"] : []) {
    canonical.searchParams.set(key, url.searchParams.get(key)!);
  }
  return {
    platform: "facebook",
    canonicalUrl: canonical.href,
    video: page?.[2] === "videos" || reel || !!watch || share?.[1] === "v",
    ...(page ? { user: page[1]!.toLowerCase() } : {}),
  };
}

export const metaEmbedAdapter: RegisteredAdapter = {
  id: "meta_embed",
  // Threads stays a link: its embed frame origin is unverified in research.
  frameHosts: ["https://www.facebook.com", "https://www.instagram.com"],
  policy: { storesContent: false, aiAllowed: false, scriptHosts: ["https://www.instagram.com"] },
  matches: (input) => metaPost(input) !== null,
  describe(input) {
    requireMatch(input, metaEmbedAdapter.matches);
    const post = metaPost(input)!;
    const url = post.canonicalUrl;
    let embed: EmbedDescriptor = { kind: "link", url };
    if (post.platform === "instagram") {
      embed = { kind: "blockquote", url, scriptUrl: "https://www.instagram.com/embed.js" };
    } else if (post.platform === "facebook") {
      embed = {
        kind: "iframe",
        url: `https://www.facebook.com/plugins/${post.video ? "video" : "post"}.php?href=${encodeURIComponent(url)}${post.video ? "" : "&show_text=true"}`,
      };
    }
    return { platform: post.platform, canonicalUrl: url, embed };
  },
  author(input) {
    const post = metaPost(input);
    if (!post?.user) return null;
    return post.platform === "threads"
      ? { handle: `@${post.user}`, url: `https://www.threads.com/@${post.user}` }
      : { handle: post.user, url: `https://www.facebook.com/${post.user}` };
  },
  liveness: async () => "unknown",
};
