import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilmOnboarding, filmMayOpenHere } from "@/components/film/film-onboarding";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";

const state = vi.hoisted(() => ({
  authenticated: true,
  person: undefined as { filmSeen: boolean } | null | undefined,
  pathname: "/en/map",
  search: "",
}));

// Inlines only the portal, so the real dialog content can be read in static markup.
vi.mock("radix-ui", async (original) => {
  const actual = await original<typeof import("radix-ui")>();
  return {
    ...actual,
    Dialog: {
      ...actual.Dialog,
      Portal: ({
        children,
      }: ComponentProps<typeof actual.Dialog.Portal> & { children?: ReactNode }) => <>{children}</>,
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: state.authenticated }),
  useQuery: () => state.person,
  useMutation: () => vi.fn(),
}));

beforeEach(() => {
  state.authenticated = true;
  state.person = { filmSeen: false };
  state.pathname = "/en/map";
  state.search = "";
});

describe("the welcome film", () => {
  it("shows nothing to someone signed out, or before their record has loaded", () => {
    state.authenticated = false;
    state.person = undefined;
    expect(render(<FilmOnboarding locale="en" />)).toBe("");
    state.authenticated = true;
    expect(render(<FilmOnboarding locale="en" />)).toBe("");
    state.person = null;
    expect(render(<FilmOnboarding locale="en" />)).toBe("");
  });

  it("opens by itself for a member who has not closed it, with a way to close it", () => {
    const html = render(<FilmOnboarding locale="en" />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain(shellMessages.en.filmTitle);
    expect(html).toContain('poster="/film/noren-intro.jpg"');
    expect(html).toContain('preload="none"');
    expect(html).toContain(`aria-label="${shellMessages.en.filmClose}"`);
    expect(html).toContain(`aria-label="${shellMessages.en.filmButtonLabel}"`);
  });

  it("stays closed once they have closed it, and keeps the button", () => {
    state.person = { filmSeen: true };
    const html = render(<FilmOnboarding locale="en" />);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("<video");
    expect(html).toContain(`aria-label="${shellMessages.en.filmButtonLabel}"`);
  });

  it("waits while someone has come to write a story, and keeps the button", () => {
    state.pathname = "/en/places/some-place";
    state.search = "tab=stories&write=1";
    const html = render(<FilmOnboarding locale="en" />);
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain(`aria-label="${shellMessages.en.filmButtonLabel}"`);
  });

  it("plays the Japanese-voice film on a Japanese page, with no captions forced on", () => {
    state.pathname = "/ja/map";
    const html = render(<FilmOnboarding locale="ja" />);
    expect(html).toContain(shellMessages.ja.filmTitle);
    expect(html).toContain(`aria-label="${shellMessages.ja.filmClose}"`);
    expect(html).toContain('src="/film/noren-intro-ja.mp4"');
    expect(html).toContain('src="/film/noren-intro-ja.ja.vtt"');
    expect(html).not.toMatch(/<track[^>]*\bdefault\b/);
  });

  it("links to the Japanese video on YouTube below the Japanese film, in a new tab", () => {
    state.pathname = "/ja/map";
    const html = render(<FilmOnboarding locale="ja" />);
    expect(html).toContain('href="https://www.youtube.com/watch?v=5qWkDLRznw0"');
    expect(html).toContain(welcomeMessages.ja.watchOnYoutube);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html.indexOf("</video>")).toBeLessThan(html.indexOf("youtube.com"));
    expect(html).not.toContain("cs5iDFAb-oI");
    expect(html).not.toMatch(/<iframe|<script|\/embed\//i);
  });

  it("links to the English video on YouTube below the English film, in a new tab", () => {
    const html = render(<FilmOnboarding locale="en" />);
    expect(html).toContain('href="https://www.youtube.com/watch?v=cs5iDFAb-oI"');
    expect(html).toContain(welcomeMessages.en.watchOnYoutube);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html.indexOf("</video>")).toBeLessThan(html.indexOf("youtube.com"));
    expect(html).not.toContain("5qWkDLRznw0");
    expect(html).not.toMatch(/<iframe|<script|\/embed\//i);
  });

  it("keeps the English-voice film on an English page", () => {
    const html = render(<FilmOnboarding locale="en" />);
    expect(html).toContain('src="/film/noren-intro.mp4"');
    expect(html).not.toContain("noren-intro-ja");
  });

  it.each([
    ["/en/map", null, true],
    ["/en", null, true],
    ["/ja/places/some-place", null, true],
    ["/en/places/some-place", "1", false],
    ["/en/welcome", null, false],
    ["/ja/sign-in/factor-one", null, false],
    ["/en/sign-up", null, false],
    ["/en/terms", null, false],
    ["/ja/privacy", null, false],
    [null, null, true],
  ])("on %s with write=%s it may open by itself: %s", (pathname, write, expected) => {
    expect(filmMayOpenHere(pathname, write)).toBe(expected);
  });
});
