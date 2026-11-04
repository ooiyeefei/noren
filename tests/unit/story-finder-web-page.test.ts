import { describe, expect, it, vi } from "vitest";
import {
  createPageReader,
  htmlText,
  robotsAllows,
  robotsRules,
  textAroundPlace,
  USER_AGENT,
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

describe("createPageReader", () => {
  function site(
    robots: Response | Error,
    page: Response = new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  ) {
    return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      void init;
      if (String(url).endsWith("/robots.txt")) {
        if (robots instanceof Error) throw robots;
        return robots.clone();
      }
      return page.clone();
    });
  }

  it("reads an allowed page with a named User-Agent and no cookies, once per origin for robots.txt", async () => {
    const fetch = site(new Response("User-agent: *\nDisallow: /private/\n"));
    const read = createPageReader({ fetch: fetch as typeof globalThis.fetch });
    const page = await read("https://blog.example.com/entry/1", NAMES);
    expect(page).toEqual({
      ok: true,
      text: expect.stringContaining("架空珈琲 試験堂に行きました"),
      author: "Mock Blogger & Co",
      publishedAt: Date.parse("2026-09-30T10:00:00+09:00"),
    });
    expect(await read("https://blog.example.com/private/2", NAMES)).toEqual({
      ok: false,
      reason: "robots",
    });
    await read("https://blog.example.com/entry/3", NAMES);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/robots.txt"))).toHaveLength(1);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).get("user-agent")).toBe(USER_AGENT);
      expect(init?.credentials).toBe("omit");
    }
  });

  it("a missing robots.txt allows; a server error or no answer keeps away", async () => {
    expect(
      (
        await createPageReader({ fetch: site(new Response("", { status: 404 })) as typeof fetch })(
          "https://a.example/x",
          NAMES,
        )
      ).ok,
    ).toBe(true);
    expect(
      await createPageReader({ fetch: site(new Response("", { status: 503 })) as typeof fetch })(
        "https://a.example/x",
        NAMES,
      ),
    ).toEqual({ ok: false, reason: "robots" });
    expect(
      await createPageReader({ fetch: site(new Error("offline")) as typeof fetch })(
        "https://a.example/x",
        NAMES,
      ),
    ).toEqual({ ok: false, reason: "robots" });
  });

  it("skips pages that are not HTML, fail, or never name the place", async () => {
    const ok = new Response("", { status: 404 });
    expect(
      await createPageReader({
        fetch: site(
          ok,
          new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
        ) as typeof fetch,
      })("https://a.example/x", NAMES),
    ).toEqual({ ok: false, reason: "not_html" });
    expect(
      await createPageReader({
        fetch: site(ok, new Response("", { status: 500 })) as typeof fetch,
      })("https://a.example/x", NAMES),
    ).toEqual({ ok: false, reason: "http" });
    expect(
      await createPageReader({
        fetch: site(
          ok,
          new Response("<p>other</p>", { headers: { "content-type": "text/html" } }),
        ) as typeof fetch,
      })("https://a.example/x", NAMES),
    ).toEqual({ ok: false, reason: "no_mention" });
    expect(
      await createPageReader({ fetch: site(ok) as typeof fetch })("javascript:alert(1)", NAMES),
    ).toEqual({ ok: false, reason: "invalid_url" });
  });
});
