import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import proxy from "@/proxy";

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
  it("sends a signed-out visitor from the bare domain to the about page, in their language", async () => {
    expect(await location(visit("/", false, "en").response)).toBe("/en/about");
    expect(await location(visit("/", false, "ja").response)).toBe("/ja/about");
    expect(await location(visit("/", false).response)).toBe("/ja/about");
    expect(await location(visit("/?from=card", false, "en").response)).toBe("/en/about?from=card");
  });

  it("sends a signed-in visitor from the bare domain to the map", async () => {
    expect(await location(visit("/", true, "en").response)).toBe("/en");
    expect(await location(visit("/", true, "ja").response)).toBe("/ja");
  });

  it("keeps the map open to signed-out visitors, and asks about sign-in only at the bare domain", async () => {
    const map = visit("/en", false);
    expect(await map.response).toBeUndefined();
    const notice = visit("/notice", false, "en");
    expect(await location(notice.response)).toBe("/en/notice");
    expect(map.auth).not.toHaveBeenCalled();
    expect(notice.auth).not.toHaveBeenCalled();
  });

  it("still sends signed-out visitors on role pages to sign in", async () => {
    const { auth, response } = visit("/en/creator", false);
    await response;
    expect(auth.protect).toHaveBeenCalledOnce();
  });
});
