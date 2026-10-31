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
    expect(html.split(`href="/${locale}"`)).toHaveLength(3);
    expect(html).toContain('href="#different"');
    expect(html).toContain('id="different"');
    expect(html).toContain(`href="${REPO_URL}"`);
    for (const key of Object.keys(m) as (keyof typeof m)[])
      if (key !== "metaTitle") expect(html, key).toContain(m[key]);
  });

  it(`answers how Noren differs, Noren last among the four apps (${locale})`, () => {
    const rows = Array.from(html.matchAll(/data-compare="([a-z]+)"/g), (match) => match[1]);
    expect(rows).toEqual(["maps", "reviews", "travel", "noren"]);
    expect(html.match(/<th scope="row"/g)).toHaveLength(4);
    expect(html.match(/<th scope="col"/g)).toHaveLength(3);
  });

  it(`draws its sketches from shapes, hidden from screen readers, with the Japanese cloth marked (${locale})`, () => {
    expect(html.match(/<figure/g)).toHaveLength(2);
    expect(html.match(/<figcaption/g)).toHaveLength(2);
    expect(html).toMatch(/aria-hidden="true"[^>]*><div class="about-cloth/);
    expect(html).toContain('lang="ja"');
    expect(html).toContain("prefers-reduced-motion: no-preference");
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
