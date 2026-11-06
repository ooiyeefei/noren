import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import proxy, { config } from "@/proxy";

// The proxy's own handler, without Clerk around it: clerkMiddleware hands back the function it wraps.
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: (handler: unknown) => handler }));

type Handler = (auth: unknown, request: NextRequest) => Promise<Response | undefined>;
const handle = proxy as unknown as Handler;

function visit(path: string, signedIn: boolean, language?: string) {
  const auth = Object.assign(
    vi.fn(async () => ({ isAuthenticated: signedIn })),
    { protect: vi.fn() },
  );
  const request = new NextRequest(`https://noren.mock.example${path}`, {
    headers: language ? { "accept-language": language } : {},
  });
  return { auth, response: handle(auth, request) };
}

async function location(response: Promise<Response | undefined>) {
  const result = await response;
  expect(result?.status).toBe(307);
  const url = new URL(result!.headers.get("location")!);
  return url.pathname + url.search;
}

describe("proxy", () => {
  it("sends a signed-out visitor from the bare domain to the welcome page, in their language", async () => {
    expect(await location(visit("/", false, "en").response)).toBe("/en/welcome");
    expect(await location(visit("/", false, "ja").response)).toBe("/ja/welcome");
    expect(await location(visit("/", false).response)).toBe("/ja/welcome");
    expect(await location(visit("/?from=card", false, "en").response)).toBe(
      "/en/welcome?from=card",
    );
  });

  it("leaves the film and its captions to the static host, so they keep their path and range requests", () => {
    const pages = new RegExp(`^${config.matcher[0]}$`);
    expect(pages.test("/film/noren-intro.mp4")).toBe(false);
    expect(pages.test("/film/noren-intro.ja.vtt")).toBe(false);
    expect(pages.test("/en/welcome")).toBe(true);
  });

  it("keeps a signed-out visitor's shared links open: the welcome page only meets the front door", async () => {
    expect(await visit("/en/places/some-shop", false).response).toBeUndefined();
    expect(await visit("/en/about", false).response).toBeUndefined();
    expect(await visit("/en/welcome", false).response).toBeUndefined();
  });

  it("sends a signed-out visitor from a language's root to the welcome page too", async () => {
    expect(await location(visit("/en", false).response)).toBe("/en/welcome");
    expect(await location(visit("/ja", false).response)).toBe("/ja/welcome");
    expect(await location(visit("/en?from=card", false).response)).toBe("/en/welcome?from=card");
  });

  it("sends a signed-in visitor from the bare domain and a language's root to the map", async () => {
    expect(await location(visit("/", true, "en").response)).toBe("/en/map");
    expect(await location(visit("/", true, "ja").response)).toBe("/ja/map");
    expect(await location(visit("/en", true).response)).toBe("/en/map");
    expect(await location(visit("/ja", true).response)).toBe("/ja/map");
  });

  it("keeps the map open to signed-out visitors, and asks about sign-in only at the front door", async () => {
    const map = visit("/en/map", false);
    expect(await map.response).toBeUndefined();
    const notice = visit("/notice", false, "en");
    expect(await location(notice.response)).toBe("/en/notice");
    expect(map.auth).not.toHaveBeenCalled();
    expect(notice.auth).not.toHaveBeenCalled();
  });

  describe.each(["terms", "privacy", "sign-up"])("the public page /%s", (page) => {
    it.each(["en", "ja"])(
      "reaches a signed-out visitor in %s, without the welcome page",
      async (lang) => {
        const { auth, response } = visit(`/${lang}/${page}`, false);
        expect(await response).toBeUndefined();
        expect(auth).not.toHaveBeenCalled();
        expect(auth.protect).not.toHaveBeenCalled();
      },
    );

    it("takes the visitor's language when the address has none, which is what Clerk's legal links use", async () => {
      const en = visit(`/${page}`, false, "en");
      expect(await location(en.response)).toBe(`/en/${page}`);
      expect(await location(visit(`/${page}`, false, "ja").response)).toBe(`/ja/${page}`);
      expect(await location(visit(`/${page}`, false).response)).toBe(`/ja/${page}`);
      expect(en.auth).not.toHaveBeenCalled();
    });

    it("goes through the proxy like any page, so Clerk can see the request", () => {
      const pages = new RegExp(`^${config.matcher[0]}$`);
      expect(pages.test(`/${page}`)).toBe(true);
      expect(pages.test(`/en/${page}`)).toBe(true);
    });
  });

  it("keeps the return address when sign-up has no language in its address", async () => {
    const path = "/sign-up?redirect_url=%2Fen%2Fplaces%2Fa-shop";
    expect(await location(visit(path, false, "en").response)).toBe(
      "/en/sign-up?redirect_url=%2Fen%2Fplaces%2Fa-shop",
    );
  });

  it("leaves the steps inside Clerk's sign-up form to the form", async () => {
    for (const step of ["sso-callback", "continue", "verify-email-address"]) {
      const { auth, response } = visit(`/en/sign-up/${step}`, false);
      expect(await response).toBeUndefined();
      expect(auth.protect).not.toHaveBeenCalled();
    }
  });

  it("still sends signed-out visitors on role pages to sign in", async () => {
    const { auth, response } = visit("/en/creator", false);
    await response;
    expect(auth.protect).toHaveBeenCalledOnce();
  });

  it("sends signed-out visitors to the stamp book to sign in", async () => {
    const { auth, response } = visit("/en/stamps", false);
    await response;
    expect(auth.protect).toHaveBeenCalledOnce();
  });

  it("sends signed-out visitors to the account page to sign in", async () => {
    const { auth, response } = visit("/en/account", false);
    await response;
    expect(auth.protect).toHaveBeenCalledOnce();
  });

  it("leaves the account deletion route to answer for itself, so it can say 401 as JSON", async () => {
    const { auth, response } = visit("/api/account/delete", false);
    expect(await response).toBeUndefined();
    expect(auth.protect).not.toHaveBeenCalled();
  });
});
