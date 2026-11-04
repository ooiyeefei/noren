export const TITLE_MAX = 200;
export const AUTHOR_MAX = 100;
export const CAPTION_MAX = 2000;
/** A tag longer than this is not a real meta tag. */
const TAG_MAX = 8192;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[\da-f]{1,6}|[a-z]{2,8});/gi, (whole, body: string) => {
    if (body[0] !== "#") return ENTITIES[body.toLowerCase()] ?? whole;
    const code =
      body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
      ? String.fromCodePoint(code)
      : "";
  });
}

/** One line of text: no control or direction characters, no runs of space, at most `limit` long. */
export function cleanText(text: string, limit: number): string {
  const clean = text
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > limit ? clean.slice(0, limit).trimEnd() : clean;
}

/** Fragment of markup to text. It is shown as text and never rendered, so a tag left over is harmless. */
export function plainText(html: string, limit: number): string {
  const text = html
    .slice(0, TAG_MAX * 4)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ");
  return cleanText(decodeEntities(text), limit);
}

/** The words of X's oEmbed markup, without the links to its own pictures. */
export function tweetText(html: string, limit: number): string {
  const body = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html.slice(0, TAG_MAX * 4))?.[1] ?? "";
  return plainText(
    body.replace(/<a\b[^>]*>\s*(?:https?:\/\/t\.co\/|pic\.(?:x|twitter)\.com\/)[^<]*<\/a>/gi, " "),
    limit,
  );
}

/** A page's declared character set: Japanese blogs are not all UTF-8. */
export function decodePage(bytes: Uint8Array, contentType: string | null): string {
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]{0,200}charset=["']?([\w-]+)/i.exec(
      new TextDecoder("latin1").decode(bytes.subarray(0, 2048)),
    )?.[1];
  try {
    return new TextDecoder(declared ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function attributes(tag: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const name = match[1]!.toLowerCase();
    if (!found.has(name)) found.set(name, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return found;
}

export type PageTags = { title?: string; description?: string; siteName?: string; author?: string };

/**
 * Reads the Open Graph and title tags of a page's head. It walks the text forward once rather than
 * using one large pattern, so a hostile page of half-open tags costs no more than a normal one.
 */
export function pageTags(html: string): PageTags {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = headEnd === -1 ? html : html.slice(0, headEnd);
  const meta = new Map<string, string>();
  const start = /<meta\b/gi;
  while (start.exec(head) !== null) {
    const from = start.lastIndex;
    const end = head.indexOf(">", from);
    if (end === -1) break;
    start.lastIndex = end;
    if (end - from > TAG_MAX) continue;
    const tag = attributes(head.slice(from, end));
    const key = (tag.get("property") ?? tag.get("name"))?.toLowerCase();
    const content = tag.get("content");
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const opened = /<title\b[^>]{0,200}>/i.exec(head);
  let title: string | undefined;
  if (opened) {
    const rest = head.slice(opened.index + opened[0].length);
    const closed = rest.search(/<\/title\s*>/i);
    if (closed !== -1) title = rest.slice(0, closed);
  }
  const text = (limit: number, ...values: (string | undefined)[]) => {
    for (const value of values) {
      const clean = value === undefined ? "" : plainText(value, limit);
      if (clean) return clean;
    }
    return undefined;
  };
  const articleAuthor = meta.get("article:author");
  return {
    title: text(TITLE_MAX, meta.get("og:title"), meta.get("twitter:title"), title),
    description: text(
      CAPTION_MAX,
      meta.get("og:description"),
      meta.get("twitter:description"),
      meta.get("description"),
    ),
    siteName: text(AUTHOR_MAX, meta.get("og:site_name")),
    // article:author is often a link to a profile, which is not a name.
    author: text(
      AUTHOR_MAX,
      meta.get("author"),
      articleAuthor && !/^https?:/i.test(articleAuthor) ? articleAuthor : undefined,
    ),
  };
}
