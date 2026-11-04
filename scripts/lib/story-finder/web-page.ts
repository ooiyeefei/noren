import { parseHttpUrl } from "../../../src/lib/adapters/url";
import { TEXT_MAX } from "../../../src/lib/story-finder/mention";
import { namesPlace } from "./types";

/** The robots.txt product token, and the User-Agent sent with it. */
export const ROBOTS_TOKEN = "NorenStoryFinder";
export const USER_AGENT = `${ROBOTS_TOKEN}/0.1 (+https://noren.yooi.me)`;

type Rule = { allow: boolean; path: string };

/**
 * The rules robots.txt gives our token, or `*` when no group names it (RFC 9309: the most specific
 * group applies; within it the longest matching path wins, and Allow wins a tie).
 */
export function robotsRules(robotsTxt: string, token = ROBOTS_TOKEN): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (field === "user-agent") {
      if (!lastWasAgent || current === null) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      if (current && (value || field === "allow"))
        current.rules.push({ allow: field === "allow", path: value });
    } else lastWasAgent = false;
  }
  const own = groups.filter((group) =>
    group.agents.some((agent) => token.toLowerCase().startsWith(agent) && agent !== "*"),
  );
  const chosen = own.length ? own : groups.filter((group) => group.agents.includes("*"));
  return chosen.flatMap((group) => group.rules);
}

function pathMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

export function robotsAllows(rules: readonly Rule[], pathAndQuery: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.path || !pathMatches(rule.path, pathAndQuery)) continue;
    if (
      best === null ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow)
    )
      best = rule;
  }
  return best === null || best.allow;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

function metaContent(html: string, key: string): string | undefined {
  const escaped = key.replace(/[.:]/g, "\\$&");
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${escaped}["']`,
    "i",
  );
  const match = pattern.exec(html);
  const value = match?.[1] ?? match?.[2];
  return value ? decodeEntities(value).trim().slice(0, 100) : undefined;
}

/** The readable text of an HTML page: scripts, styles and page furniture removed, blocks on lines. */
export function htmlText(html: string): string {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|template|iframe|head|nav|footer|aside|form)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|section|article|tr|dd|dt)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t 　]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * The part of a page around the first mention of the place, at most TEXT_MAX characters; null when
 * the page never names it.
 */
export function textAroundPlace(text: string, names: readonly string[]): string | null {
  if (!namesPlace(text, names)) return null;
  let first = text.length;
  for (const name of names) {
    const index = name.trim().length >= 2 ? text.indexOf(name.trim()) : -1;
    if (index >= 0 && index < first) first = index;
  }
  if (first === text.length) first = 0;
  const start = Math.max(0, first - Math.floor(TEXT_MAX / 3));
  return text.slice(start, start + TEXT_MAX).trim();
}

export type PageReader = (
  url: string,
  names: readonly string[],
) => Promise<
  | { ok: true; text: string; author?: string; publishedAt?: number }
  | { ok: false; reason: "invalid_url" | "robots" | "http" | "not_html" | "no_mention" | "network" }
>;

/**
 * Reads public web pages politely: robots.txt first (cached per origin; a 4xx means no rules, a 5xx
 * or a network error means stay away, as RFC 9309 says), one request at a time, no cookies, a
 * named User-Agent and a size cap.
 */
export function createPageReader(
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): PageReader {
  const send = options.fetch ?? fetch;
  const robots = new Map<string, Promise<Rule[] | null>>();
  const get = (url: string, accept: string) =>
    send(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "ja,en;q=0.8" },
      redirect: "follow",
      credentials: "omit",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  const rulesFor = (origin: string) => {
    if (!robots.has(origin))
      robots.set(
        origin,
        (async () => {
          try {
            const response = await get(`${origin}/robots.txt`, "text/plain");
            if (response.status >= 500) return null;
            if (!response.ok) return [];
            return robotsRules((await response.text()).slice(0, 500_000));
          } catch {
            return null;
          }
        })(),
      );
    return robots.get(origin)!;
  };
  return async (url, names) => {
    const parsed = parseHttpUrl(url);
    if (!parsed.ok) return { ok: false, reason: "invalid_url" };
    const rules = await rulesFor(parsed.url.origin);
    if (rules === null || !robotsAllows(rules, parsed.url.pathname + parsed.url.search))
      return { ok: false, reason: "robots" };
    let html: string;
    try {
      const response = await get(parsed.url.href, "text/html,application/xhtml+xml");
      if (!response.ok) return { ok: false, reason: "http" };
      if (!/html/i.test(response.headers.get("content-type") ?? ""))
        return { ok: false, reason: "not_html" };
      html = (await response.text()).slice(0, 2_000_000);
    } catch {
      return { ok: false, reason: "network" };
    }
    const text = textAroundPlace(htmlText(html), names);
    if (text === null) return { ok: false, reason: "no_mention" };
    const published = Date.parse(metaContent(html, "article:published_time") ?? "");
    return {
      ok: true,
      text,
      author: metaContent(html, "author") ?? metaContent(html, "og:site_name"),
      ...(Number.isFinite(published) ? { publishedAt: published } : {}),
    };
  };
}
