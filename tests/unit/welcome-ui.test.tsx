import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WelcomePage from "@/app/[lang]/welcome/page";
import { WelcomeView } from "@/components/welcome/welcome-view";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";
import type { RegionConfig } from "@/lib/region/schema";
import { config } from "../fixtures/public-ui";

const state = vi.hoisted(() => ({ region: undefined as unknown, locale: "en" as string }));
vi.mock("@/lib/region/registry", async (original) => {
  const actual = await original<typeof import("@/lib/region/registry")>();
  return { ...actual, activeRegionConfig: () => state.region ?? actual.activeRegionConfig() };
});
vi.mock("next/root-params", () => ({ lang: async () => state.locale }));

const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

// Only one of these shows, depending on whether accounts are open.
const OPEN_ONLY = ["membersNoteOpen", "makeAccount"];

for (const locale of ["ja", "en"] as const) {
  const m = welcomeMessages[locale];
  const html = text(render(<WelcomeView locale={locale} accountsOpen={false} />));

  it(`says what Noren is with one heading, shows every line and leads to the map twice (${locale})`, () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(`>${m.heroTitle}</h1>`);
    expect(html).toContain(`<main id="main" tabindex="-1" lang="${locale}"`);
    expect(html.split(`href="/${locale}/map"`)).toHaveLength(3);
    for (const key of Object.keys(m) as (keyof typeof m)[])
      if (key !== "metaTitle" && !OPEN_ONLY.includes(key)) expect(html, key).toContain(m[key]);
  });

  it(`loads the film only when someone presses play, with captions in both languages (${locale})`, () => {
    expect(html.match(/<video\b/g)).toHaveLength(1);
    expect(html).toContain('preload="none"');
    expect(html).toContain('poster="/film/noren-intro.jpg"');
    expect(html).toContain('src="/film/noren-intro.mp4"');
    expect(html).toContain(`aria-label="${m.filmLabel}"`);
    expect(html).not.toMatch(/\bautoplay\b/i);
    expect(html).toContain('src="/film/noren-intro.en.vtt"');
    expect(html).toContain('src="/film/noren-intro.ja.vtt"');
  });

  it(`turns Japanese captions on for a Japanese page only, because the voice is English (${locale})`, () => {
    expect(html.includes("default")).toBe(locale === "ja");
  });

  describe(`what it says about adding (${locale})`, () => {
    const inviteOnly = locale === "ja" ? /招待制/ : /invite-only/;

    it("says plainly that AI writes the stories and that adding is invite-only while closed", () => {
      expect(m.readBody).toContain("AI");
      expect(m.membersNote).toMatch(inviteOnly);
      expect(html).toMatch(inviteOnly);
      expect(html).not.toContain(m.membersNoteOpen);
      expect(html).not.toContain("/sign-up");
    });

    it("says adding takes a free account, and links to sign-up, once open", () => {
      const open = text(render(<WelcomeView locale={locale} accountsOpen />));
      expect(open).toContain(m.membersNoteOpen);
      expect(open).toContain(`href="/${locale}/sign-up"`);
      expect(open).toContain(m.makeAccount);
      expect(open).not.toMatch(inviteOnly);
    });

    it("the page follows the region's switch", async () => {
      state.locale = locale;
      const closed: RegionConfig = structuredClone(config);
      closed.legal.accountsOpen = false;
      state.region = closed;
      expect(text(render(await WelcomePage()))).toContain(m.membersNote);
      const opened: RegionConfig = structuredClone(config);
      opened.legal.accountsOpen = true;
      opened.legal.documentsVersion = "2030-01-31";
      state.region = opened;
      expect(text(render(await WelcomePage()))).toContain(m.membersNoteOpen);
    });
  });
}
