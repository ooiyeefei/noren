import { describeSource } from "../adapters";
import type { SourceAdapterId } from "../domain/constants";
import { isAllowedServerFetch, isPublicAddress, isPublicPageUrl } from "../security/outbound";
import { describeCheckFailure } from "../story-finder/check";
import { AUTHOR_MAX, CAPTION_MAX, cleanText, decodePage, pageTags, tweetText } from "./page";
import { EMBED_ONLY_ADAPTERS, type LinkRead } from "./types";

const USER_AGENT = "Noren/0.1 (+https://noren.yooi.me)";
const TIMEOUT_MS = 8000;
const BYTE_LIMIT = 512 * 1024;
const REDIRECT_LIMIT = 4;

/**
 * Services whose pages Noren never reads, even as a plain link or at the end of a redirect: they get
 * their official embed or a typed line. A profile page on Instagram is a link card, and still is not read.
 */
const NOT_READ =
  /(?:^|\.)(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.me|fb\.watch|threads\.net|threads\.com|tiktok\.com|x\.com|twitter\.com|t\.co|youtube\.com|youtu\.be|youtube-nocookie\.com|google\.[a-z.]+|goo\.gl)$/;

const OEMBED: Partial<Record<SourceAdapterId, (canonicalUrl: string) => string>> = {
  tiktok: (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  youtube: (url) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  x: (url) =>
    `https://publish.x.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(url)}`,
};

/** Its name is what the log and the form show; describeCheckFailure adds any HTTP status. */
class LinkReadError extends Error {
  statusCode?: number;
  constructor(name: string, statusCode?: number) {
    super(name);
    this.name = name;
    this.statusCode = statusCode;
  }
}

export type LinkReadOptions = {
  /** Every address a host name resolves to. */
  lookup(hostname: string): Promise<readonly string[]>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      signal.throwIfAborted();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
}

async function cappedBytes(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const bytes = new Uint8Array(BYTE_LIMIT);
  let size = 0;
  while (size < BYTE_LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    const part = value.subarray(0, BYTE_LIMIT - size);
    bytes.set(part, size);
    size += part.length;
  }
  void reader.cancel().catch(() => undefined);
  return bytes.subarray(0, size);
}

function discard(response: Response) {
  void response.body?.cancel().catch(() => undefined);
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 500) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

async function readOembed(
  adapter: SourceAdapterId,
  endpoint: string,
  options: LinkReadOptions,
  signal: AbortSignal,
): Promise<LinkRead> {
  if (!isAllowedServerFetch(endpoint)) throw new LinkReadError("RefusedLink");
  const { fetch = globalThis.fetch } = options;
  const response = await fetch(endpoint, {
    method: "GET",
    redirect: "error",
    credentials: "omit",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    discard(response);
    throw new LinkReadError("OembedFailed", response.status);
  }
  const body = JSON.parse(new TextDecoder().decode(await cappedBytes(response))) as Record<
    string,
    unknown
  >;
  const words =
    adapter === "x"
      ? tweetText(typeof body.html === "string" ? body.html : "", CAPTION_MAX)
      : cleanText(typeof body.title === "string" ? body.title : "", CAPTION_MAX);
  const author = cleanText(
    typeof body.author_name === "string" ? body.author_name : "",
    AUTHOR_MAX,
  );
  const authorUrl = httpsUrl(body.author_url);
  return {
    // TikTok's endpoint answers with only a player for most posts, so words are not a given.
    outcome: words ? "read" : "embed_only",
    ...(words ? { caption: words } : {}),
    ...(author ? { author } : {}),
    ...(authorUrl ? { authorUrl } : {}),
  };
}

async function assertReadable(url: URL, options: LinkReadOptions, signal: AbortSignal) {
  if (!isPublicPageUrl(url) || NOT_READ.test(url.hostname)) throw new LinkReadError("RefusedLink");
  const addresses = await abortable(options.lookup(url.hostname), signal);
  // A name could still re-point after this check, but over HTTPS the certificate would not match.
  if (addresses.length === 0 || !addresses.every(isPublicAddress))
    throw new LinkReadError("RefusedLink");
}

/** Follows redirects by hand, so each hop has to pass the same check as the link itself. */
async function readPage(
  start: string,
  options: LinkReadOptions,
  signal: AbortSignal,
): Promise<LinkRead> {
  const { fetch = globalThis.fetch } = options;
  let url = new URL(start);
  for (let hop = 0; hop <= REDIRECT_LIMIT; hop += 1) {
    await assertReadable(url, options, signal);
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      discard(response);
      const location = response.headers.get("location");
      if (!location) throw new LinkReadError("PageFailed", response.status);
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      discard(response);
      throw new LinkReadError("PageFailed", response.status);
    }
    const type = response.headers.get("content-type");
    if (!/^\s*(?:text\/html|application\/xhtml\+xml)/i.test(type ?? "")) {
      discard(response);
      throw new LinkReadError("NotAPage");
    }
    const tags = pageTags(decodePage(await cappedBytes(response), type));
    if (!tags.title && !tags.description) throw new LinkReadError("NothingToRead");
    return {
      outcome: "read",
      ...(tags.title ? { title: tags.title } : {}),
      ...(tags.description ? { caption: tags.description } : {}),
      // A site's name is not who wrote the post, so it stays out of the credit.
      ...(tags.author ? { author: tags.author } : {}),
      ...(tags.siteName ? { siteName: tags.siteName } : {}),
    };
  }
  throw new LinkReadError("TooManyRedirects");
}

/**
 * What is publicly and properly available about a link a member pasted, using the platform's public
 * oEmbed or a plain page's own tags. No logins, cookies, proxies or scraping. Never throws: the form
 * works without any of this, so a failure comes back as an outcome of "unread".
 */
export async function readLink(
  url: string,
  enabled: readonly SourceAdapterId[],
  options: LinkReadOptions,
): Promise<LinkRead> {
  try {
    const described = describeSource(url, enabled);
    if (!described.ok) throw new LinkReadError("RefusedLink");
    const { adapter, canonicalUrl } = described.source;
    if (EMBED_ONLY_ADAPTERS.includes(adapter)) return { outcome: "embed_only" };
    const signal = AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS);
    const endpoint = OEMBED[adapter]?.(canonicalUrl);
    const work = endpoint
      ? readOembed(adapter, endpoint, options, signal)
      : readPage(canonicalUrl, options, signal);
    return await abortable(work, signal);
  } catch (error) {
    return { outcome: "unread", failure: describeCheckFailure(error) };
  }
}
