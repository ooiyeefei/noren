import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HomeView, PublicLoading } from "@/components/public/home-view";
import { toHomeModel } from "@/components/public/mapping";
import { publicMessages } from "@/lib/i18n/messages/public";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { landmark, place, region } from "../fixtures/public-ui";

vi.mock("maplibre-gl", () => {
  throw new Error("MapLibre must not load during SSR");
});
for (const locale of ["ja", "en"] as const) {
  const m = publicMessages[locale];
  const model = toHomeModel([{ ...place, hasStory: true }, landmark], locale, region);
  const home = () => render(<HomeView locale={locale} region={region} model={model} />);
  it(`lists every place before the map, with one heading and bilingual story rows (${locale})`, () => {
    const html = home();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(locale === "en" ? "Nagasaki&#x27;s local places" : "長崎の地元のお店");
    for (const slug of ["demo-cafe", "demo-landmark"])
      expect(html.indexOf(`href="/${locale}/places/${slug}"`)).toBeLessThan(
        html.indexOf(`aria-label="${placeUiMessages[locale].mapLabel}"`),
      );
    expect(html).toContain('data-badge="demo"');
    expect(html).toContain('data-story="true"');
    expect(html).toContain('data-story="false"');
    const legend = html.match(/data-explore-legend="true"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    expect(legend).toContain(m.legendStory);
    expect(legend).toContain(m.legendPlace);
    expect(html).toContain(`lang="${locale === "en" ? "ja" : "en"}"`);
    expect(html).toContain(region.attribution[0]);
  });
  it(`has single-select ordered chips and an optional Demo chip (${locale})`, () => {
    const html = home();
    expect(html).toContain('data-category="" aria-pressed="true"');
    expect(html).toContain('data-category="cafe" aria-pressed="false"');
    expect(html.indexOf('data-category=""')).toBeLessThan(html.indexOf('data-category="cafe"'));
    expect(html.indexOf('data-category="cafe"')).toBeLessThan(
      html.indexOf('data-category="attraction"'),
    );
    expect(html.indexOf('data-category="attraction"')).toBeLessThan(
      html.indexOf('data-category="demo"'),
    );
    const filtered = render(
      <HomeView locale={locale} region={region} model={model} category="cafe" search="coffee" />,
    );
    expect(filtered).toContain('data-category="cafe" aria-pressed="true"');
    expect(filtered).toContain(`aria-label="${m.clearSearch}"`);
    const real = render(
      <HomeView locale={locale} region={region} model={toHomeModel([landmark], locale, region)} />,
    );
    expect(real).not.toContain('data-category="demo"');
  });
  it(`shows intentional empty states and the guide, and names the active chip when filtered (${locale})`, () => {
    const empty = render(
      <HomeView locale={locale} region={region} model={toHomeModel([], locale, region)} />,
    );
    expect(empty).toContain(m.noPlaces);
    expect(empty).toContain(m.guideTitle);
    for (const step of [m.guide1, m.guide2, m.guide3, m.gotIt]) expect(empty).toContain(step);
    expect(empty).toContain(`aria-label="${placeUiMessages[locale].mapLabel}"`);
    const filtered = render(
      <HomeView
        locale={locale}
        region={region}
        model={toHomeModel([], locale, region)}
        totalCount={2}
        category="cafe"
      />,
    );
    expect(filtered).toContain(
      locale === "en" ? "No cafes match." : "「カフェ・喫茶店」に一致するお店はありません。",
    );
    expect(filtered).not.toContain(m.noPlaces);
  });
  it(`exposes sheet, location privacy and plain ordering text (${locale})`, () => {
    const html = home();
    expect(html).toContain(`aria-label="${m.showList}" aria-expanded="true"`);
    expect(html).toContain(`aria-label="${m.search}"`);
    expect(html).toContain(placeUiMessages[locale].locateNote);
    expect(html).toContain(m.storiesFirst);
    expect(html).not.toContain("<select");
    expect(html).toContain('data-sheet="half"');
    expect(html).not.toContain("bottom-full");
    expect(html).toMatch(/id="[^"]*-list"[^>]*><div class="mx-4 mb-3 lg:mt-4"><aside/);
    const full = render(
      <HomeView
        locale={locale}
        region={region}
        model={model}
        sheet="full"
        guideVisible={false}
        locationOff
        position={{ lat: 32, lng: 129 }}
      />,
    );
    expect(full).toContain(`aria-label="${m.showMap}" aria-expanded="true"`);
    expect(full).toContain(m.nearest);
    expect(full).not.toContain("<select");
    const peek = render(
      <HomeView locale={locale} region={region} model={model} guideVisible={false} />,
    );
    expect(peek).toContain('data-sheet="peek"');
    expect(peek).toContain(`aria-label="${m.showList}" aria-expanded="false"`);
    expect(full).toContain(placeUiMessages[locale].locationOff);
    expect(full).not.toContain(m.guideTitle);
  });
  it(`contains no rating, score, star or sentiment words (${locale})`, () => {
    for (const html of [home(), render(<PublicLoading locale={locale} />)])
      expect(html).not.toMatch(/\b(?:rating|score|star|sentiment)s?\b|評価|点数|星評価|感情分析/i);
  });
}
it("category chips preserve focus order even if region input is reversed", () => {
  const html = render(
    <HomeView
      locale="en"
      region={{ ...region, categories: [...region.categories!].reverse() }}
      model={toHomeModel([], "en", region)}
    />,
  );
  expect(html.indexOf('data-category="cafe"')).toBeLessThan(
    html.indexOf('data-category="attraction"'),
  );
});

for (const locale of ["en", "ja"] as const) {
  for (const n of [0, 1, 2]) {
    it(`renders the place count for ${n} in ${locale}`, () => {
      const model = toHomeModel(
        Array.from({ length: n }, () => place),
        locale,
        region,
      );
      const html = render(<HomeView locale={locale} region={region} model={model} />);
      const expected = locale === "ja" ? `${n} 件` : `${n} ${n === 1 ? "place" : "places"}`;
      expect(html).toContain(`role="status" class="text-[15px] font-bold">${expected}</p>`);
    });
  }
}
it("keeps the phone heading hidden, spaces it on desktop and wraps desktop chips", () => {
  const html = render(
    <HomeView locale="en" region={region} model={toHomeModel([], "en", region)} />,
  );
  const heading = html.match(/<h1 class="([^"]*)"/)![1];
  expect(heading).toContain("sr-only");
  expect(heading).toContain("lg:not-sr-only");
  expect(heading).toContain("lg:mb-5");
  const chips = html.match(/role="group" aria-label="Category" class="([^"]*)"/)![1];
  expect(chips).toContain("overflow-x-auto");
  expect(chips).toContain("lg:flex-wrap");
  expect(chips).toContain("lg:overflow-visible");
});
