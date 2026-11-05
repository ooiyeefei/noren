import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { WelcomeView } from "@/components/welcome/welcome-view";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";

const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

for (const locale of ["ja", "en"] as const) {
  const m = welcomeMessages[locale];
  const html = text(render(<WelcomeView locale={locale} />));

  it(`says what Noren is with one heading, shows every line and leads to the map twice (${locale})`, () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(`>${m.heroTitle}</h1>`);
    expect(html).toContain(`<main id="main" tabindex="-1" lang="${locale}"`);
    expect(html.split(`href="/${locale}/map"`)).toHaveLength(3);
    for (const key of Object.keys(m) as (keyof typeof m)[])
      if (key !== "metaTitle") expect(html, key).toContain(m[key]);
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

  it(`says plainly that AI writes the stories and that adding is invite-only (${locale})`, () => {
    expect(m.readBody).toContain("AI");
    expect(m.membersNote).toMatch(locale === "ja" ? /招待制/ : /invite-only/);
  });
}
