import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPageReader,
  htmlScreenText,
  htmlText,
  isPublicAddress,
  MAX_REDIRECTS,
  nodeTransport,
  robotsAllows,
  robotsRules,
  textAroundPlace,
  USER_AGENT,
  type Lookup,
  type Transport,
  type TransportResponse,
} from "../../scripts/lib/story-finder/web-page";

const NAMES = ["架空珈琲 試験堂", "Fictional Test Coffee House"];
// A made-up blog page.
const PAGE = `<!doctype html><html><head><title>Mock blog</title>
<meta name="author" content="Mock Blogger &amp; Co">
<meta property="article:published_time" content="2026-09-30T10:00:00+09:00">
<script>var secret = "never read";</script><style>p{}</style></head>
<body><nav>Home | About</nav><article><h1>長崎のテスト旅行記</h1>
<p>架空珈琲 試験堂に行きました。店主の祖父が始めた焙煎所です&hellip;</p>
<p>二階から港が見えます。</p></article><footer>© mock</footer></body></html>`;

describe("robots.txt", () => {
  const txt = `User-agent: *
Disallow: /private/
Allow: /private/ok

User-agent: OtherBot
Disallow: /

User-agent: NorenStoryFinder
Disallow: /drafts/
Disallow: /*.pdf$
`;

  it("uses our own group when there is one, else *", () => {
    const own = robotsRules(txt);
    expect(robotsAllows(own, "/drafts/x")).toBe(false);
    expect(robotsAllows(own, "/private/x")).toBe(true);
    expect(robotsAllows(own, "/file.pdf")).toBe(false);
    expect(robotsAllows(own, "/file.pdf?x")).toBe(true);
    const star = robotsRules("User-agent: *\nDisallow: /private/\nAllow: /private/ok\n");
    expect(robotsAllows(star, "/private/x")).toBe(false);
    expect(robotsAllows(star, "/private/ok/1")).toBe(true);
    expect(robotsAllows(star, "/public")).toBe(true);
  });

  it("the longest match wins and Allow wins a tie; an empty Disallow allows everything", () => {
    const rules = robotsRules(
      "User-agent: *\nDisallow: /a\nAllow: /a\nDisallow: /a/b/c\nAllow: /a/b\n",
    );
    expect(robotsAllows(rules, "/a")).toBe(true);
    expect(robotsAllows(rules, "/a/b/c/d")).toBe(false);
    expect(robotsAllows(robotsRules("User-agent: *\nDisallow:\n"), "/anything")).toBe(true);
    expect(robotsAllows(robotsRules("User-agent: *\nDisallow: /\n"), "/anything")).toBe(false);
  });
});

describe("page text", () => {
  it("drops scripts, styles and page furniture and decodes entities", () => {
    const text = htmlText(PAGE);
    expect(text).toContain("架空珈琲 試験堂に行きました。店主の祖父が始めた焙煎所です…");
    expect(text).not.toMatch(/never read|Home \| About|© mock|Mock blog/);
  });

  it("keeps the part around the place's first mention, or nothing when the page never names it", () => {
    const text = `${"x".repeat(20_000)} 架空珈琲 試験堂 ${"y".repeat(20_000)}`;
    const around = textAroundPlace(text, NAMES)!;
    expect(around.length).toBeLessThanOrEqual(8000);
    expect(around).toContain("架空珈琲 試験堂");
    expect(textAroundPlace("nothing here", NAMES)).toBeNull();
  });
});

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "[::1]",
    "fe80::1",
    "fe80::1%eth0",
    "fc00::1",
    "fd12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::ffff:10.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:a9fe:a9fe::1",
    "2001:0:4136:e378::1",
    "2001:db8::1",
    "ff02::1",
    "not-an-address",
    "",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "93.184.215.14",
    "172.32.0.1",
    "100.128.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ])("allows %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// The reader, against a made-up internet: a fake resolver and a fake transport
// ---------------------------------------------------------------------------------------------

const PUBLIC = "93.184.215.14";
const html = (body: string): Partial<TransportResponse> => ({
  contentType: "text/html; charset=utf-8",
  body,
});
const redirect = (location: string, status = 302): Partial<TransportResponse> => ({
  status,
  location,
});

function fakeInternet(
  routes: Record<string, Partial<TransportResponse> | Error>,
  dns: Record<string, string[]> = {},
) {
  const requests: { url: string; address: string; headers: Record<string, string> }[] = [];
  const lookups: string[] = [];
  const transport: Transport = async ({ url, address, headers }) => {
    requests.push({ url: url.href, address: address.address, headers });
    const route = routes[url.href];
    if (route instanceof Error) throw route;
    if (!route) return { status: 404, contentType: "text/plain", body: "" };
    return { status: 200, contentType: "text/plain", body: "", ...route };
  };
  const lookup: Lookup = async (hostname) => {
    lookups.push(hostname);
    const addresses = dns[hostname] ?? (hostname.endsWith(".example.com") ? [PUBLIC] : null);
    if (!addresses) throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { read: createPageReader({ transport, lookup }), requests, lookups };
}

const METADATA = "169.254.169.254";
const sentTo = (requests: { url: string; address: string }[], pattern: RegExp) =>
  requests.filter((request) => pattern.test(request.url) || pattern.test(request.address));

describe("htmlScreenText", () => {
  it("keeps footers, side bars and menus, drops scripts, styles and comments, and joins inline tags", () => {
    const text = htmlScreenText(
      `<head><title>題</title><style>p{}</style></head><body><nav>メニュー</nav><p>本文<b>プロ</b>モーション</p>` +
        `<script>var a = "x < y";</script><!-- 隠し --><aside>横</aside><footer>下<br>端&amp;</footer></body>`,
    );
    expect(text).toBe("題\nメニュー\n本文プロモーション\n横\n下\n端&");
  });

  it("handles unclosed blocks and stray brackets in linear time", () => {
    for (const unit of ["<script ", "<style ", "<!-- ", "<a", "<p <"]) {
      const started = performance.now();
      htmlScreenText(unit.repeat(250_000));
      expect(performance.now() - started, unit).toBeLessThan(2_000);
    }
  });
});

describe("createPageReader: the ad screen sees the whole page", () => {
  const DISCLOSURE = "※この記事はプロモーションを含みます";
  const body = (before: string, after: string) =>
    `<html><body><article>${before}<p>架空珈琲 試験堂に行きました。</p>${"<p>架空の旅行記の前置きです。</p>".repeat(900)}${after}</article></body></html>`;

  it("flags a disclosure at the bottom of a long page that the returned text leaves out", async () => {
    const net = fakeInternet({
      "https://blog.example.com/long": html(body("", `<p>${DISCLOSURE}</p>`)),
    });
    const page = await net.read("https://blog.example.com/long", NAMES);
    expect(page).toMatchObject({ ok: true, adMarker: true });
    if (page.ok) expect(page.text).not.toContain(DISCLOSURE);
  });

  it("flags a disclosure at the top, before the place is named", async () => {
    const net = fakeInternet({
      "https://blog.example.com/top": html(body(`<p>${DISCLOSURE}</p>`, "")),
    });
    const page = await net.read("https://blog.example.com/top", NAMES);
    expect(page).toMatchObject({ ok: true, adMarker: true });
  });

  const wrap = (inArticle: string, afterArticle: string) =>
    `<html><head><title>Mock</title></head><body><nav>Home</nav><article><p>架空珈琲 試験堂に行きました。</p>${"<p>架空の旅行記の前置きです。</p>".repeat(900)}${inArticle}</article>${afterArticle}</body></html>`;

  it("flags a disclosure in a footer or an aside, which the page text leaves out", async () => {
    const net = fakeInternet({
      "https://blog.example.com/footer": html(wrap("", `<footer><p>${DISCLOSURE}</p></footer>`)),
      "https://blog.example.com/aside": html(wrap("", `<aside><p>${DISCLOSURE}</p></aside>`)),
    });
    for (const where of ["footer", "aside"]) {
      const page = await net.read(`https://blog.example.com/${where}`, NAMES);
      expect(page, where).toMatchObject({ ok: true, adMarker: true });
      if (page.ok) expect(page.text, where).not.toContain("プロモーション");
    }
  });

  it("does not flag an ordinary blog for the labels on its ad slots", async () => {
    const net = fakeInternet({
      "https://blog.example.com/slots": html(
        wrap(
          "<div>スポンサードリンク</div>",
          "<aside><p>広告</p><p>PR</p><p>【PR】架空の航空券</p></aside><footer><p>スポンサードリンク</p></footer>",
        ),
      ),
    });
    const page = await net.read("https://blog.example.com/slots", NAMES);
    expect(page).toMatchObject({ ok: true });
    expect(page).not.toHaveProperty("adMarker");
  });

  it("flags a disclosure that inline tags split into pieces", async () => {
    const net = fakeInternet({
      "https://blog.example.com/inline": html(
        wrap("<p>※この記事は<b>プロモーション</b>を<em>含み</em>ます</p>", ""),
      ),
    });
    expect(await net.read("https://blog.example.com/inline", NAMES)).toMatchObject({
      ok: true,
      adMarker: true,
    });
  });

  it("does not take a script, a style or a comment for a disclosure", async () => {
    const net = fakeInternet({
      "https://blog.example.com/hidden": html(
        wrap(
          `<script>var s = "${DISCLOSURE}";</script><style>/* ${DISCLOSURE} */</style><!-- ${DISCLOSURE} -->`,
          "",
        ),
      ),
    });
    const page = await net.read("https://blog.example.com/hidden", NAMES);
    expect(page.ok).toBe(true);
    if (page.ok) expect(page).not.toHaveProperty("adMarker");
  });

  it("sets no flag on a page without a label", async () => {
    const net = fakeInternet({ "https://blog.example.com/plain": html(body("", "")) });
    const page = await net.read("https://blog.example.com/plain", NAMES);
    expect(page.ok).toBe(true);
    if (page.ok) expect(page).not.toHaveProperty("adMarker");
  });
});

describe("createPageReader", () => {
  it("reads an allowed page with a named User-Agent and no cookies, reading robots.txt once per origin", async () => {
    const net = fakeInternet({
      "https://blog.example.com/robots.txt": { body: "User-agent: *\nDisallow: /private/\n" },
      "https://blog.example.com/entry/1": html(PAGE),
      "https://blog.example.com/entry/3": html(PAGE),
    });
    expect(await net.read("https://blog.example.com/entry/1", NAMES)).toEqual({
      ok: true,
      url: "https://blog.example.com/entry/1",
      text: expect.stringContaining("架空珈琲 試験堂に行きました"),
      author: "Mock Blogger & Co",
      publishedAt: Date.parse("2026-09-30T10:00:00+09:00"),
    });
    expect(await net.read("https://blog.example.com/private/2", NAMES)).toEqual({
      ok: false,
      reason: "robots",
    });
    await net.read("https://blog.example.com/entry/3", NAMES);
    expect(sentTo(net.requests, /robots\.txt$/)).toHaveLength(1);
    expect(sentTo(net.requests, /private/)).toHaveLength(0);
    for (const request of net.requests) {
      expect(request.headers["User-Agent"]).toBe(USER_AGENT);
      expect(Object.keys(request.headers).map((name) => name.toLowerCase())).not.toContain(
        "cookie",
      );
      // Every request goes to the address that was checked.
      expect(request.address).toBe(PUBLIC);
    }
  });

  it("a missing robots.txt allows; a server error or no answer keeps away", async () => {
    const page = { "https://a.example.com/x": html(PAGE) };
    expect((await fakeInternet(page).read("https://a.example.com/x", NAMES)).ok).toBe(true);
    for (const robots of [{ status: 503 }, new Error("offline")]) {
      const net = fakeInternet({ ...page, "https://a.example.com/robots.txt": robots });
      expect(await net.read("https://a.example.com/x", NAMES)).toEqual({
        ok: false,
        reason: "robots",
      });
      expect(sentTo(net.requests, /\/x$/)).toHaveLength(0);
    }
  });

  it("skips pages that are not HTML, fail, never name the place, or are not web addresses", async () => {
    const read = (route: Partial<TransportResponse> | Error) =>
      fakeInternet({ "https://a.example.com/x": route }).read("https://a.example.com/x", NAMES);
    expect(await read({ contentType: "application/pdf", body: "%PDF" })).toEqual({
      ok: false,
      reason: "not_html",
    });
    expect(await read({ status: 500 })).toEqual({ ok: false, reason: "http" });
    expect(await read(html("<p>other</p>"))).toEqual({ ok: false, reason: "no_mention" });
    expect(await read(new Error("reset"))).toEqual({ ok: false, reason: "network" });
    const net = fakeInternet({});
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "ftp://a.example.com/x",
      "https://user:pass@a.example.com/x",
      "https://a.example.com:8443/x",
      "http://intranet/x",
    ])
      expect(await net.read(url, NAMES), url).toEqual({ ok: false, reason: "invalid_url" });
    expect(await net.read("https://nowhere.invalid/x", NAMES)).toEqual({
      ok: false,
      reason: "dns",
    });
    expect(net.requests).toHaveLength(0);
  });

  it("follows a redirect within the site and reports where the page was read", async () => {
    const net = fakeInternet({
      "https://blog.example.com/old": redirect("/2026/new", 301),
      "https://blog.example.com/2026/new": html(PAGE),
    });
    expect(await net.read("https://blog.example.com/old", NAMES)).toMatchObject({
      ok: true,
      url: "https://blog.example.com/2026/new",
    });
  });

  describe("never reaches the machine's own network (SSRF)", () => {
    it.each([
      `http://${METADATA}/latest/meta-data/`,
      `http://${METADATA}./latest/meta-data/`,
      "http://2852039166/latest/meta-data/",
      "http://0xa9.0xfe.0xa9.0xfe/latest/meta-data/",
      "http://0251.0376.0251.0376/latest/meta-data/",
      `http://[::ffff:${METADATA}]/latest/meta-data/`,
      "http://[::ffff:a9fe:a9fe]/latest/meta-data/",
      "http://[fd00:ec2::254]/latest/meta-data/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://0.0.0.0/",
    ])("a redirect to %s is refused before anything is sent there", async (target) => {
      const net = fakeInternet({ "https://blog.example.com/go": redirect(target) });
      expect(await net.read("https://blog.example.com/go", NAMES)).toEqual({
        ok: false,
        reason: "private_address",
      });
      expect(net.requests.map((request) => request.url)).toEqual([
        "https://blog.example.com/robots.txt",
        "https://blog.example.com/go",
      ]);
      // And the same address as a starting point.
      expect(await net.read(target, NAMES)).toEqual({ ok: false, reason: "private_address" });
      expect(net.requests).toHaveLength(2);
    });

    it.each([
      [["10.0.0.5"]],
      [["172.20.1.1"]],
      [["192.168.0.10"]],
      [[METADATA]],
      [["100.100.100.200"]],
      [["127.0.0.1"]],
      [["fd00::5"]],
      [["fe80::a9fe:a9fe"]],
      [["::ffff:10.0.0.5"]],
      // One private answer among public ones is enough to refuse: the connection could use either.
      [[PUBLIC, "10.0.0.5"]],
      [["2606:4700:4700::1111", "::1"]],
    ])("a redirect to a name that resolves to %j is refused", async (addresses) => {
      const net = fakeInternet(
        {
          "https://blog.example.com/go": redirect("https://internal.mock-corp.net/admin"),
          "https://internal.mock-corp.net/admin": html(PAGE),
        },
        { "internal.mock-corp.net": addresses },
      );
      expect(await net.read("https://blog.example.com/go", NAMES)).toEqual({
        ok: false,
        reason: "private_address",
      });
      expect(net.lookups).toContain("internal.mock-corp.net");
      // Not the page, and not its robots.txt either.
      expect(sentTo(net.requests, /mock-corp/)).toHaveLength(0);
      expect(net.requests.every((request) => request.address === PUBLIC)).toBe(true);
    });

    it("a page whose own name resolves privately is refused at the start", async () => {
      const net = fakeInternet({}, { "metadata.mock-cloud.net": [METADATA] });
      expect(await net.read("http://metadata.mock-cloud.net/latest/meta-data/", NAMES)).toEqual({
        ok: false,
        reason: "private_address",
      });
      expect(net.requests).toHaveLength(0);
    });

    it("checks every hop again: port, scheme, skipped sites and robots.txt", async () => {
      const via = (target: string, extra: Record<string, Partial<TransportResponse>> = {}) =>
        fakeInternet({ "https://blog.example.com/go": redirect(target), ...extra }).read(
          "https://blog.example.com/go",
          NAMES,
        );
      expect(await via("https://other.example.com:8080/x")).toEqual({
        ok: false,
        reason: "invalid_url",
      });
      expect(await via("file:///etc/passwd")).toEqual({ ok: false, reason: "invalid_url" });
      expect(await via("gopher://other.example.com/x")).toEqual({
        ok: false,
        reason: "invalid_url",
      });
      expect(await via("https://user:pass@other.example.com/x")).toEqual({
        ok: false,
        reason: "invalid_url",
      });
      expect(await via("https://tabelog.com/nagasaki/mock/")).toEqual({
        ok: false,
        reason: "skipped_host",
      });
      expect(
        await via("https://other.example.com/members/1", {
          "https://other.example.com/robots.txt": { body: "User-agent: *\nDisallow: /members/\n" },
          "https://other.example.com/members/1": html(PAGE),
        }),
      ).toEqual({ ok: false, reason: "robots" });
      expect(await via("")).toEqual({ ok: false, reason: "http" });
    });

    it(`follows at most ${MAX_REDIRECTS} redirects`, async () => {
      const chain = (length: number) => {
        const routes: Record<string, Partial<TransportResponse>> = {};
        for (let i = 0; i < length; i++)
          routes[`https://blog.example.com/r${i}`] = redirect(`/r${i + 1}`);
        routes[`https://blog.example.com/r${length}`] = html(PAGE);
        return fakeInternet(routes);
      };
      expect((await chain(MAX_REDIRECTS).read("https://blog.example.com/r0", NAMES)).ok).toBe(true);
      const tooLong = chain(MAX_REDIRECTS + 1);
      expect(await tooLong.read("https://blog.example.com/r0", NAMES)).toEqual({
        ok: false,
        reason: "too_many_redirects",
      });
      expect(sentTo(tooLong.requests, new RegExp(`/r${MAX_REDIRECTS + 1}$`))).toHaveLength(0);
    });

    it("a robots.txt that redirects to the metadata address counts as no answer", async () => {
      const net = fakeInternet({
        "https://blog.example.com/robots.txt": redirect(`http://${METADATA}/latest/`),
        "https://blog.example.com/x": html(PAGE),
      });
      expect(await net.read("https://blog.example.com/x", NAMES)).toEqual({
        ok: false,
        reason: "robots",
      });
      expect(sentTo(net.requests, /169\.254/)).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The real transport, against a local server (the reader would never allow this address; the
// transport is given it directly to show that it connects where it is told and nowhere else)
// ---------------------------------------------------------------------------------------------

describe("nodeTransport", () => {
  let server: Server;
  let port = 0;
  const seen: { path: string; headers: IncomingHttpHeaders }[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      seen.push({ path: request.url ?? "", headers: request.headers });
      response.on("error", () => {});
      switch (request.url) {
        case "/page":
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end("<p>架空珈琲 試験堂</p>");
          return;
        case "/sjis":
          // テスト in Shift_JIS.
          response.writeHead(200, { "content-type": "text/html; charset=Shift_JIS" });
          response.end(Buffer.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]));
          return;
        case "/gzip":
          response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          response.end(gzipSync("<p>compressed</p>"));
          return;
        case "/big":
          response.writeHead(200, { "content-type": "text/html" });
          response.end(Buffer.alloc(3_000_000, 0x61));
          return;
        case "/bomb":
          response.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
          response.end(gzipSync(Buffer.alloc(20_000_000, 0x61)));
          return;
        case "/redirect":
          response.writeHead(302, { location: `http://${METADATA}/latest/meta-data/` });
          response.end("moved");
          return;
        case "/slow":
          return; // never answers
        default:
          response.writeHead(404);
          response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  // A made-up name that resolves nowhere: the request can only arrive through the pinned address.
  const get = (path: string, options: { timeoutMs?: number; maxBytes?: number } = {}) =>
    nodeTransport({
      url: new URL(`http://pinned.mock-site.test:${port}${path}`),
      address: { address: "127.0.0.1", family: 4 },
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: options.timeoutMs ?? 5000,
      maxBytes: options.maxBytes ?? 1_000_000,
    });

  it("connects to the pinned address, sends the name as Host and no cookies", async () => {
    expect(await get("/page")).toEqual({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<p>架空珈琲 試験堂</p>",
    });
    const request = seen.find((entry) => entry.path === "/page")!;
    expect(request.headers.host).toBe(`pinned.mock-site.test:${port}`);
    expect(request.headers["user-agent"]).toBe(USER_AGENT);
    expect(request.headers.cookie).toBeUndefined();
  });

  it("decodes the page's character set and compression", async () => {
    expect((await get("/sjis")).body).toBe("テスト");
    expect((await get("/gzip")).body).toBe("<p>compressed</p>");
  });

  it("reads at most maxBytes, after decompression too", async () => {
    expect((await get("/big", { maxBytes: 1000 })).body).toHaveLength(1000);
    expect((await get("/bomb", { maxBytes: 1000 })).body).toHaveLength(1000);
  });

  it("returns a redirect without following it", async () => {
    expect(await get("/redirect")).toMatchObject({
      status: 302,
      location: `http://${METADATA}/latest/meta-data/`,
      body: "",
    });
  });

  it("gives up after the timeout", async () => {
    await expect(get("/slow", { timeoutMs: 200 })).rejects.toThrow("timed out");
  });
});
