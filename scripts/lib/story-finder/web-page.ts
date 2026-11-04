import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { parseHttpUrl } from "../../../src/lib/adapters/url";
import { storedPostText } from "../../../src/lib/story-finder/mention";
import { namesPlace } from "./types";

/** The robots.txt product token, and the User-Agent sent with it. */
export const ROBOTS_TOKEN = "NorenStoryFinder";
export const USER_AGENT = `${ROBOTS_TOKEN}/0.1 (+https://noren.yooi.me)`;

/** Redirects followed for one page (RFC 9309 asks robots.txt readers to follow at least five). */
export const MAX_REDIRECTS = 5;
const PAGE_MAX_BYTES = 2_000_000;
const ROBOTS_MAX_BYTES = 500_000;

// ---------------------------------------------------------------------------------------------
// Which hosts and addresses may be read
// ---------------------------------------------------------------------------------------------

/** Sites that are covered by another collector, are listings or shops, or forbid reuse. */
const SKIP_HOSTS =
  /(^|\.)(google\.[a-z.]+|goo\.gl|instagram\.com|facebook\.com|tiktok\.com|reddit\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|threads\.(net|com)|tabelog\.com|retty\.me|hotpepper\.jp|gnavi\.co\.jp|tripadvisor\.[a-z.]+|jalan\.net|travel\.rakuten\.co\.jp|rakuten\.co\.jp|booking\.com|agoda\.com|expedia\.[a-z.]+|ikyu\.com|yelp\.[a-z.]+|wikipedia\.org|amazon\.[a-z.]+|navitime\.co\.jp|mapion\.co\.jp|ekiten\.jp|hitosara\.com|line\.me|nagasaki-tabinet\.com)$/i;

export function isSkippedHost(hostname: string): boolean {
  return SKIP_HOSTS.test(hostname.replace(/\.$/, ""));
}

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    value = value * 256 + Number(part);
  }
  return value;
}

/** IPv4 ranges never read: this network, private, shared (CGNAT), loopback, link-local, etc. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function publicV4(value: number): boolean {
  return !BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (ipv4Number(base)! & mask) >>> 0;
  });
}

/** An IPv6 address as eight 16-bit groups, or null. Accepts "::" and a dotted IPv4 tail. */
function ipv6Groups(address: string): number[] | null {
  let text = address
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "")
    .toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const v4 = ipv4Number(tail[1]!);
    if (v4 === null) return null;
    text = `${text.slice(0, -tail[1]!.length)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(":") : []);
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

/**
 * Whether an address is on the public internet. Refused: loopback, private (10/8, 172.16/12,
 * 192.168/16), link-local (169.254/16, fe80::/10, where cloud instance metadata lives), CGNAT
 * (100.64/10), unique-local (fc00::/7), unspecified, multicast, documentation and reserved ranges,
 * and any of these inside an IPv6 form (IPv4-mapped, -compatible, NAT64, 6to4, Teredo).
 */
export function isPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "");
  const family = isIP(bare.replace(/%.*$/, ""));
  if (family === 4) return publicV4(ipv4Number(bare)!);
  if (family !== 6) return false;
  const g = ipv6Groups(bare);
  if (g === null) return false;
  const v4 = (high: number, low: number) => ((high << 16) >>> 0) + low;
  if (g.slice(0, 6).every((x) => x === 0)) {
    // :: and ::1, and IPv4-compatible ::a.b.c.d.
    if (g[6] === 0 && (g[7] === 0 || g[7] === 1)) return false;
    return publicV4(v4(g[6]!, g[7]!));
  }
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return publicV4(v4(g[6]!, g[7]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
    return publicV4(v4(g[6]!, g[7]!));
  if (g[0] === 0x2002) return publicV4(v4(g[1]!, g[2]!));
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo hides an IPv4 address
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // unique local
  if ((g[0]! & 0xffc0) === 0xfe80) return false; // link-local
  if ((g[0]! & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((g[0]! & 0xff00) === 0xff00) return false; // multicast
  return true;
}

export type Address = { address: string; family: 4 | 6 };
/** Every address a hostname resolves to. */
export type Lookup = (hostname: string) => Promise<Address[]>;

const systemLookup: Lookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({
    address,
    family: family === 6 ? 6 : 4,
  }));

type Refusal =
  | "invalid_url"
  | "skipped_host"
  | "private_address"
  | "dns"
  | "robots"
  | "too_many_redirects"
  | "http"
  | "not_html"
  | "no_mention"
  | "network";

/** An address that may be requested, or why not: http(s), no credentials, default port, listed host. */
function checkUrl(input: string): { ok: true; url: URL } | { ok: false; reason: Refusal } {
  let raw: URL;
  try {
    raw = new URL(input);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  // An address literal (including 2852039166, 0xa9.0xfe.0xa9.0xfe and [::ffff:a9fe:a9fe], which
  // URL turns into dotted or bracketed form) is refused here, before anything else.
  const host = raw.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host))
    return { ok: false, reason: isPublicAddress(host) ? "invalid_url" : "private_address" };
  // http or https, no user or password, a dotted name, and the default port only.
  const parsed = parseHttpUrl(input);
  if (!parsed.ok) return { ok: false, reason: "invalid_url" };
  if (isSkippedHost(parsed.url.hostname)) return { ok: false, reason: "skipped_host" };
  return parsed;
}

/** The address to connect to: every address the name resolves to must be public. */
async function resolvePublic(
  hostname: string,
  lookup: Lookup,
): Promise<{ ok: true; address: Address } | { ok: false; reason: Refusal }> {
  let addresses: Address[];
  try {
    addresses = await lookup(hostname);
  } catch {
    return { ok: false, reason: "dns" };
  }
  if (!addresses.length) return { ok: false, reason: "dns" };
  if (addresses.some(({ address }) => !isPublicAddress(address)))
    return { ok: false, reason: "private_address" };
  return { ok: true, address: addresses[0]! };
}

// ---------------------------------------------------------------------------------------------
// One request, pinned to the address that was checked
// ---------------------------------------------------------------------------------------------

export type TransportResponse = {
  status: number;
  contentType: string;
  location?: string;
  /** The body as text, at most maxBytes of it. */
  body: string;
};
/**
 * Sends one GET to `url`, connecting to `address` (already checked) rather than looking the name up
 * again, so a DNS answer cannot change between the check and the connection. Never follows a
 * redirect; never sends cookies.
 */
export type Transport = (request: {
  url: URL;
  address: Address;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBytes: number;
}) => Promise<TransportResponse>;

function charsetOf(contentType: string, head: Buffer): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head.toString("latin1"));
  return meta?.[1] ?? "utf-8";
}

function decode(bytes: Buffer, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType, bytes.subarray(0, 4096))).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export const nodeTransport: Transport = ({ url, address, headers, timeoutMs, maxBytes }) =>
  new Promise((resolve, reject) => {
    const pinned: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    };
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (error: Error | null, value?: TransportResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const request = send(
      url,
      {
        method: "GET",
        headers: { ...headers, "Accept-Encoding": "gzip, deflate, br" },
        lookup: pinned,
        agent: false,
      },
      (response: IncomingMessage) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          response.destroy();
          finish(null, {
            status,
            contentType,
            location: response.headers.location,
            body: "",
          });
          return;
        }
        const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase();
        const stream: Readable =
          encoding === "gzip" || encoding === "x-gzip"
            ? response.pipe(createGunzip())
            : encoding === "deflate"
              ? response.pipe(createInflate())
              : encoding === "br"
                ? response.pipe(createBrotliDecompress())
                : response;
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () =>
          finish(null, { status, contentType, body: decode(Buffer.concat(chunks), contentType) });
        stream.on("data", (chunk: Buffer) => {
          if (settled) return;
          const room = maxBytes - size;
          chunks.push(chunk.length > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(chunk.length, room);
          // Enough read: stop downloading (a page bigger than the cap is read in part).
          if (size >= maxBytes) {
            done();
            response.destroy();
          }
        });
        stream.on("end", done);
        stream.on("error", (error) => finish(error));
      },
    );
    const timer = setTimeout(() => {
      request.destroy(new Error("timed out"));
      finish(new Error("timed out"));
    }, timeoutMs);
    request.on("error", (error) => finish(error));
    request.end();
  });

// ---------------------------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------
// Page text
// ---------------------------------------------------------------------------------------------

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
    .map((line) => line.replace(/[ \t  ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * The part of a page around the first mention of the place, at most TEXT_MAX characters
 * (storedPostText, the window storyFinder.ingest keeps too); null when the page never names it.
 */
export function textAroundPlace(text: string, names: readonly string[]): string | null {
  return namesPlace(text, names) ? storedPostText(text, names) : null;
}

// ---------------------------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------------------------

export type PageReader = (
  url: string,
  names: readonly string[],
) => Promise<
  | { ok: true; url: string; text: string; author?: string; publishedAt?: number }
  | { ok: false; reason: Refusal }
>;

/**
 * Reads public web pages politely and safely. The collector runs on a cloud machine, so a page must
 * never be able to point it at the machine's own network (instance metadata at 169.254.169.254,
 * private services): every address, including each redirect's, is checked (http or https, default
 * port, not a skipped site), every name is resolved and must resolve only to public addresses, and
 * the connection goes to the checked address. Redirects are followed by hand, at most five, with
 * robots.txt read for each origin (cached; a 4xx means no rules, a 5xx or no answer means stay
 * away, as RFC 9309 says). No cookies, a named User-Agent, a size cap and a timeout per request.
 */
export function createPageReader(
  options: { transport?: Transport; lookup?: Lookup; timeoutMs?: number } = {},
): PageReader {
  const transport = options.transport ?? nodeTransport;
  const lookup = options.lookup ?? systemLookup;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const robots = new Map<string, Promise<Rule[] | null>>();

  async function get(
    start: URL,
    accept: string,
    maxBytes: number,
    checkRobots: boolean,
  ): Promise<{ ok: true; url: URL; response: TransportResponse } | { ok: false; reason: Refusal }> {
    let url = start;
    for (let hop = 0; ; hop++) {
      // The name first: a host on a private network is refused before anything is sent to it,
      // robots.txt included.
      const resolved = await resolvePublic(url.hostname, lookup);
      if (!resolved.ok) return resolved;
      if (checkRobots) {
        const rules = await rulesFor(url.origin);
        if (rules === null || !robotsAllows(rules, url.pathname + url.search))
          return { ok: false, reason: "robots" };
      }
      let response: TransportResponse;
      try {
        response = await transport({
          url,
          address: resolved.address,
          headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "ja,en;q=0.8" },
          timeoutMs,
          maxBytes,
        });
      } catch {
        return { ok: false, reason: "network" };
      }
      if (response.status < 300 || response.status >= 400) return { ok: true, url, response };
      if (!response.location) return { ok: false, reason: "http" };
      if (hop >= MAX_REDIRECTS) return { ok: false, reason: "too_many_redirects" };
      let next: string;
      try {
        next = new URL(response.location, url).href;
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
      const checked = checkUrl(next);
      if (!checked.ok) return checked;
      url = checked.url;
    }
  }

  function rulesFor(origin: string): Promise<Rule[] | null> {
    let rules = robots.get(origin);
    if (rules === undefined) {
      rules = (async () => {
        const result = await get(
          new URL("/robots.txt", origin),
          "text/plain",
          ROBOTS_MAX_BYTES,
          false,
        );
        if (!result.ok) return null;
        const { status, body } = result.response;
        if (status >= 500) return null;
        if (status >= 400) return [];
        return status >= 200 ? robotsRules(body) : null;
      })();
      robots.set(origin, rules);
    }
    return rules;
  }

  return async (input, names) => {
    const checked = checkUrl(input);
    if (!checked.ok) return checked;
    const result = await get(checked.url, "text/html,application/xhtml+xml", PAGE_MAX_BYTES, true);
    if (!result.ok) return result;
    const { response } = result;
    if (response.status !== 200) return { ok: false, reason: "http" };
    if (!/html/i.test(response.contentType)) return { ok: false, reason: "not_html" };
    const text = textAroundPlace(htmlText(response.body), names);
    if (text === null) return { ok: false, reason: "no_mention" };
    const published = Date.parse(metaContent(response.body, "article:published_time") ?? "");
    return {
      ok: true,
      url: result.url.href,
      text,
      author: metaContent(response.body, "author") ?? metaContent(response.body, "og:site_name"),
      ...(Number.isFinite(published) ? { publishedAt: published } : {}),
    };
  };
}
