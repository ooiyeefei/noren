import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { AboutView, REPO_URL } from "@/components/about/about-view";
import { ExploreGuide } from "@/components/explore/guide";
import { aboutMessages } from "@/lib/i18n/messages/about";
import { publicMessages } from "@/lib/i18n/messages/public";

const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

for (const locale of ["ja", "en"] as const) {
  const m = aboutMessages[locale];
  const html = text(render(<AboutView locale={locale} />));

  it(`tells the idea with one heading and sends people to the map (${locale})`, () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(`>${m.heroTitle}</h1>`);
    expect(html).toContain(`<main id="main" tabindex="-1" lang="${locale}"`);
    expect(html.split(`href="/${locale}/map"`)).toHaveLength(3);
    expect(html).toContain('href="#what"');
    expect(html).toContain('id="what"');
    expect(html).toContain(`href="${REPO_URL}"`);
    for (const key of Object.keys(m) as (keyof typeof m)[])
      if (key !== "metaTitle") expect(html, key).toContain(m[key]);
  });

  it(`says AI writes the stories, names the way to remove something and claims no owner's sign-off (${locale})`, () => {
    expect(m.p2Body).toContain("AI");
    expect(m.p3Body).toMatch(locale === "ja" ? /フォーム/ : /form at the bottom/);
    expect(html).not.toMatch(
      locale === "ja"
        ? /最後に決めるのは店主|店主自身の言葉|店主へのインタビュー|店主の物語/
        : /last word|owner's story|owners' stories|Owner interview/i,
    );
  });

  it(`plays its own language's film after the name's meaning, loading nothing before play (${locale})`, () => {
    const film = locale === "ja" ? "/film/noren-intro-ja" : "/film/noren-intro";
    expect(html.match(/<video\b/g)).toHaveLength(1);
    expect(html).toContain(`<source src="${film}.mp4"`);
    expect(html).toContain('preload="none"');
    const at = (marker: string) => html.indexOf(marker);
    expect(at('id="meaning-title"')).toBeLessThan(at('id="what-title"'));
    expect(at('id="what-title"')).toBeLessThan(at("<video"));
    expect(at("<video")).toBeLessThan(at('id="feel-title"'));
    // The app comparison table is gone; the film tells that part now.
    expect(html).not.toContain("data-compare");
    expect(html).not.toContain("<table");
  });

  it(`draws its sketches from shapes, hidden from screen readers, with the Japanese cloth marked (${locale})`, () => {
    expect(html.match(/<figure/g)).toHaveLength(2);
    expect(html.match(/<figcaption/g)).toHaveLength(2);
    expect(html).toMatch(/aria-hidden="true"[^>]*><div class="about-cloth/);
    expect(html).toContain('lang="ja"');
    expect(html).toContain("prefers-reduced-motion: no-preference");
  });

  it(`calls the owner idea an idea, with no shop signed up and none named (${locale})`, () => {
    expect(m.ideaBody).toMatch(locale === "ja" ? /まだアイデアの段階/ : /still an idea/);
    expect(m.ideaBody).toMatch(locale === "ja" ? /参加しているお店もまだありません/ : /no shop has signed up/);
    expect(`${m.noticedBody}${m.ideaBody}`).not.toMatch(/Bravo|Inohara|Honda|猪原|ブラボー/);
  });

  it(`the map guide links to the page (${locale})`, () => {
    const guide = render(<ExploreGuide locale={locale} />);
    expect(guide).toContain(`href="/${locale}/about"`);
    expect(guide).toContain(publicMessages[locale].whyNoren);
  });
}

it("both languages carry the same messages", () => {
  expect(Object.keys(aboutMessages.ja).sort()).toEqual(Object.keys(aboutMessages.en).sort());
});
