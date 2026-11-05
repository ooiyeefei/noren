import { describe, expect, it, vi } from "vitest";
import { pageTags } from "../../src/lib/link-read/page";
import { readLink, type LinkReadOptions } from "../../src/lib/link-read/read";
import { isPublicAddress, isPublicPageUrl } from "../../src/lib/security/outbound";
import { SOURCE_ADAPTER_IDS } from "../../src/lib/domain/constants";

const PUBLIC_ADDRESS = "93.184.216.34";
const tiktok = "https://www.tiktok.com/@fictional_walker/video/7300000000000000000";
const youtube = "https://youtu.be/abcdefghijk?si=fictional";
const tweet = "https://x.com/fictional_walk/status/1234567890";
const blog = "https://blog.fictional.example/cat-street";

type Answer = Response | ((url: string) => Response);
function world(answers: Record<string, Answer>, addresses: Record<string, string[]> = {}) {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const hosts: string[] = [];
  const options: LinkReadOptions = {
    lookup: async (hostname) => {
      hosts.push(hostname);
      return addresses[hostname] ?? [PUBLIC_ADDRESS];
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      inits.push(init ?? {});
      const answer = answers[url] ?? answers[new URL(url).origin];
      if (!answer) throw new TypeError(`unexpected fetch: ${url}`);
      return typeof answer === "function" ? answer(url) : answer;
    }) as typeof fetch,
  };
  return { options, urls, inits, hosts };
}
const page = (html: string, type = "text/html; charset=utf-8") =>
  new Response(html, { status: 200, headers: { "content-type": type } });
const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });
const read = (url: string, options: LinkReadOptions) => readLink(url, SOURCE_ADAPTER_IDS, options);

describe("public oEmbed", () => {
  it("reads TikTok's caption and author when it gives them, with no cookies or redirects", async () => {
    const { options, urls, inits } = world({
      "https://www.tiktok.com": Response.json({
        title: "Cats  on the\nslope at dusk #nagasaki",
        author_name: "Fictional Walker",
        author_url: "https://www.tiktok.com/@fictional_walker",
      }),
    });
    expect(await read(tiktok, options)).toEqual({
      outcome: "read",
      caption: "Cats on the slope at dusk #nagasaki",
      author: "Fictional Walker",
      authorUrl: "https://www.tiktok.com/@fictional_walker",
    });
    expect(urls).toEqual([`https://www.tiktok.com/oembed?url=${encodeURIComponent(tiktok)}`]);
    expect(inits[0]).toMatchObject({
      redirect: "error",
      credentials: "omit",
      headers: { "User-Agent": "Noren/0.1 (+https://noren.yooi.me)" },
    });
  });

  it("says when TikTok's answer is only a player, its usual reply today", async () => {
    const { options } = world({
      "https://www.tiktok.com": Response.json({
        version: "1.0",
        type: "video",
        html: '<iframe src="https://www.tiktok.com/player/v1/7300000000000000000"></iframe>',
        provider_name: "TikTok",
      }),
    });
    expect(await read(tiktok, options)).toEqual({ outcome: "embed_only" });
  });

  it("reads a YouTube video's title and channel", async () => {
    const { options, urls } = world({
      "https://www.youtube.com": Response.json({
        title: "A fictional walk through Maruyama",
        author_name: "Fictional Channel",
        author_url: "https://www.youtube.com/@fictional",
      }),
    });
    expect(await read(youtube, options)).toEqual({
      outcome: "read",
      caption: "A fictional walk through Maruyama",
      author: "Fictional Channel",
      authorUrl: "https://www.youtube.com/@fictional",
    });
    expect(urls[0]).toBe(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=abcdefghijk")}`,
    );
  });

  it("reads a post's words out of X's markup as text, without its picture links", async () => {
    const { options } = world({
      "https://publish.x.com": Response.json({
        author_name: "Fictional Walker",
        author_url: "https://x.com/fictional_walker",
        html: '<blockquote class="twitter-tweet"><p lang="en" dir="ltr">Bread &amp; cats<br>on the &lt;b&gt;slope <a href="https://t.co/AbC">pic.x.com/AbC</a></p>&mdash; Fictional Walker <a href="https://x.com/i/status/1">May 1</a></blockquote>',
      }),
    });
    expect(await read(tweet, options)).toEqual({
      outcome: "read",
      caption: "Bread & cats on the <b>slope",
      author: "Fictional Walker",
      authorUrl: "https://x.com/fictional_walker",
    });
  });

  it("drops an author link that is not https", async () => {
    const { options } = world({
      "https://www.youtube.com": Response.json({
        title: "A walk",
        author_name: "Fictional",
        author_url: "javascript:alert(1)",
      }),
    });
    expect(await read(youtube, options)).toEqual({
      outcome: "read",
      caption: "A walk",
      author: "Fictional",
    });
  });
});

describe("platforms with an embed only", () => {
  it.each([
    "https://www.instagram.com/p/FICTIONAL1/",
    "https://www.instagram.com/reel/FICTIONAL2/",
    "https://www.facebook.com/fictional/posts/123",
    "https://www.threads.com/@fictional/post/FICTIONAL3",
    "https://www.google.com/maps/place/fictional",
  ])("never fetches or resolves anything for %s", async (url) => {
    const { options, urls, hosts } = world({});
    expect(await read(url, options)).toEqual({ outcome: "embed_only" });
    expect(urls).toEqual([]);
    expect(hosts).toEqual([]);
  });

  it.each([
    "https://www.instagram.com/fictional_walker/",
    "https://www.facebook.com/groups/fictional",
    "https://vm.tiktok.com/FICTIONAL/",
    "https://fb.watch/fictional/",
  ])("does not read %s as a plain page either", async (url) => {
    const { options, urls } = world({});
    expect(await read(url, options)).toEqual({ outcome: "unread", failure: "RefusedLink" });
    expect(urls).toEqual([]);
  });

  it("does not follow a plain link's redirect to Instagram", async () => {
    const { options, urls } = world({
      "https://blog.fictional.example": redirect("https://www.instagram.com/p/FICTIONAL1/"),
    });
    expect(await read(blog, options)).toEqual({ outcome: "unread", failure: "RefusedLink" });
    expect(urls).toEqual([blog]);
  });
});

describe("plain pages", () => {
  it("reads Open Graph tags with no cookies, by hand through redirects", async () => {
    const { options, urls, inits } = world({
      "https://blog.fictional.example": page(`<!doctype html><html><head>
        <title>Ignored title</title>
        <meta property="og:title" content="Cats &amp; bread on the slope">
        <meta content='A baker feeds the cats at closing time.' property='og:description'/>
        <meta property="og:site_name" content="Fictional Walks">
        <meta name="author" content="Fictional Walker">
      </head><body><script>var secret = "kept out"</script><p>Body words</p></body></html>`),
    });
    expect(await read(blog, options)).toEqual({
      outcome: "read",
      title: "Cats & bread on the slope",
      caption: "A baker feeds the cats at closing time.",
      author: "Fictional Walker",
      siteName: "Fictional Walks",
    });
    expect(urls).toEqual([blog]);
    expect(inits[0]).toMatchObject({
      redirect: "manual",
      credentials: "omit",
      headers: { "User-Agent": "Noren/0.1 (+https://noren.yooi.me)" },
    });
    expect(JSON.stringify(inits[0]?.headers)).not.toMatch(/cookie/i);
  });

  it("falls back to the title tag and description, and the site's name for the author", async () => {
    expect(
      pageTags(
        '<title lang="ja">坂の猫 &#x2013; 長崎</title><meta name="description" content="猫の話"><meta property="og:site_name" content="坂ブログ">',
      ),
    ).toEqual({
      title: "坂の猫 – 長崎",
      description: "猫の話",
      siteName: "坂ブログ",
      author: undefined,
    });
    const { options } = world({
      "https://blog.fictional.example": page(
        '<title>A walk</title><meta property="og:site_name" content="Fictional Walks">',
      ),
    });
    const result = await read(blog, options);
    expect(result).toMatchObject({ outcome: "read", title: "A walk", siteName: "Fictional Walks" });
    expect(result.author).toBeUndefined();
  });

  it("does not take a profile link for a name", () => {
    expect(
      pageTags('<meta property="article:author" content="https://example.com/fictional">').author,
    ).toBeUndefined();
  });

  it("reads a Japanese blog in its declared character set", async () => {
    // 猫 in Shift_JIS.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<meta charset="shift_jis"><title>'),
      0x94,
      0x4c,
      ...new TextEncoder().encode("</title>"),
    ]);
    const { options } = world({
      "https://blog.fictional.example": new Response(bytes, {
        headers: { "content-type": "text/html" },
      }),
    });
    expect(await read(blog, options)).toMatchObject({ title: "猫" });
  });

  it("stops at 512 KB and never sees what comes after", async () => {
    const chunk = new TextEncoder().encode(" ".repeat(64 * 1024));
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(pulled === 1 ? new TextEncoder().encode("<title>Near</title>") : chunk);
        if (pulled > 500) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const { options } = world({
      "https://blog.fictional.example": new Response(body, {
        headers: { "content-type": "text/html" },
      }),
    });
    expect(await read(blog, options)).toMatchObject({ outcome: "read", title: "Near" });
    expect(pulled).toBeLessThan(12);
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it("gets through a page of half-open tags quickly", () => {
    const started = performance.now();
    expect(pageTags("<meta ".repeat(80_000) + "<title".repeat(80_000)).title).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it.each([
    ["a PDF", page("%PDF", "application/pdf"), "NotAPage"],
    ["a page with no tags", page("<p>nothing</p>"), "NothingToRead"],
    ["a server error", new Response("no", { status: 500 }), "PageFailed HTTP 500"],
  ])("comes back unread for %s", async (_name, answer, failure) => {
    const { options } = world({ "https://blog.fictional.example": answer });
    expect(await read(blog, options)).toEqual({ outcome: "unread", failure });
  });
});

describe("SSRF", () => {
  it.each(["http://blog.fictional.example/x", "https://printer.local/x", "https://db.internal/x"])(
    "refuses %s before any fetch",
    async (url) => {
      const { options, urls } = world({});
      expect(await read(url, options)).toEqual({ outcome: "unread", failure: "RefusedLink" });
      expect(urls).toEqual([]);
    },
  );

  it.each(["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:192.168.0.1"])(
    "refuses a name that resolves to %s",
    async (address) => {
      const { options, urls } = world({}, { "blog.fictional.example": [address] });
      expect(await read(blog, options)).toEqual({ outcome: "unread", failure: "RefusedLink" });
      expect(urls).toEqual([]);
    },
  );

  it("refuses a name with one private address among public ones", async () => {
    const { options, urls } = world(
      {},
      { "blog.fictional.example": [PUBLIC_ADDRESS, "192.168.1.1"] },
    );
    expect(await read(blog, options)).toMatchObject({ failure: "RefusedLink" });
    expect(urls).toEqual([]);
  });

  it.each([
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/admin",
    "https://localhost/admin",
    "http://blog.fictional.example/plain-http",
    "https://blog.fictional.example:8443/port",
    "https://user:secret@blog.fictional.example/",
  ])("re-checks a redirect to %s and does not follow it", async (location) => {
    const { options, urls } = world({ "https://blog.fictional.example": redirect(location) });
    expect(await read(blog, options)).toMatchObject({ outcome: "unread", failure: "RefusedLink" });
    expect(urls).toEqual([blog]);
  });

  it("re-resolves each hop, so a public name cannot redirect to a private one", async () => {
    const { options, urls, hosts } = world(
      { "https://blog.fictional.example": redirect("https://inner.fictional.example/") },
      { "inner.fictional.example": ["10.1.2.3"] },
    );
    expect(await read(blog, options)).toMatchObject({ failure: "RefusedLink" });
    expect(hosts).toEqual(["blog.fictional.example", "inner.fictional.example"]);
    expect(urls).toEqual([blog]);
  });

  it("follows a safe redirect, and gives up after a few", async () => {
    const good = world({
      "https://blog.fictional.example": redirect("https://www.fictional.example/final"),
      "https://www.fictional.example": page("<title>Final</title>"),
    });
    expect(await read(blog, good.options)).toMatchObject({ title: "Final" });
    expect(good.urls).toHaveLength(2);
    const looping = world({
      "https://blog.fictional.example": () => redirect("https://blog.fictional.example/again"),
    });
    expect(await read(blog, looping.options)).toEqual({
      outcome: "unread",
      failure: "TooManyRedirects",
    });
    expect(looping.urls).toHaveLength(5);
  });

  it("tells public addresses from private ones", () => {
    for (const address of [PUBLIC_ADDRESS, "8.8.8.8", "172.32.0.1", "2606:4700::6810:84e5"])
      expect(isPublicAddress(address), address).toBe(true);
    for (const address of [
      "0.0.0.0",
      "10.255.255.255",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fe80::1%eth0",
      "ff02::1",
      "2001:db8::1",
      "2002:0a00:0001::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "not an address",
      "999.1.1.1",
      "1:2:3",
    ])
      expect(isPublicAddress(address), address).toBe(false);
  });

  it("tells a page's address from one that is not", () => {
    expect(isPublicPageUrl(blog)).toBe(true);
    for (const url of [
      "http://example.com/",
      "https://example.com:8080/",
      "https://me:pw@example.com/",
      "https://127.0.0.1/",
      "https://0x7f.1/",
      "https://[::1]/",
      "https://localhost/",
      "https://localhost./",
      "https://foo.localhost/",
      "https://printer.local/",
      "https://metadata.google.internal/",
      "not a url",
    ])
      expect(isPublicPageUrl(url), url).toBe(false);
  });
});

describe("a failed read", () => {
  it("names a timeout when the service hangs", async () => {
    const options: LinkReadOptions = {
      lookup: async () => [PUBLIC_ADDRESS],
      timeoutMs: 20,
      fetch: ((_url: string, init: RequestInit) =>
        new Promise((_, reject) =>
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        )) as typeof fetch,
    };
    expect(await read(youtube, options)).toEqual({ outcome: "unread", failure: "TimeoutError" });
  });

  it("times out a host name that never resolves", async () => {
    const options: LinkReadOptions = {
      lookup: () => new Promise(() => undefined),
      timeoutMs: 20,
      fetch: vi.fn(),
    };
    expect(await read(blog, options)).toEqual({ outcome: "unread", failure: "TimeoutError" });
    expect(options.fetch).not.toHaveBeenCalled();
  });

  it("gives the status when oEmbed refuses", async () => {
    const { options } = world({ "https://www.youtube.com": new Response("", { status: 404 }) });
    expect(await read(youtube, options)).toEqual({
      outcome: "unread",
      failure: "OembedFailed HTTP 404",
    });
  });

  it("names an unreadable answer and a throw that is not an Error", async () => {
    const { options } = world({ "https://www.youtube.com": new Response("<html>not json") });
    expect(await read(youtube, options)).toEqual({ outcome: "unread", failure: "SyntaxError" });
    const options2: LinkReadOptions = {
      lookup: async () => [PUBLIC_ADDRESS],
      fetch: (() => Promise.reject("gone")) as typeof fetch,
    };
    expect(await read(youtube, options2)).toEqual({
      outcome: "unread",
      failure: "NonError: string",
    });
  });

  it("refuses a link no adapter takes, without throwing", async () => {
    const { options, urls } = world({});
    expect(await read("not a link", options)).toEqual({
      outcome: "unread",
      failure: "RefusedLink",
    });
    expect(urls).toEqual([]);
  });
});
