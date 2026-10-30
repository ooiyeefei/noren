import { isValidElement, type ReactNode } from "react";
import { PlaceMap } from "@/components/map/place-map";
import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { PlaceView } from "@/components/public/place-view";
import type { PlaceDetailLike } from "@/components/public/mapping";
import { publicMessages } from "@/lib/i18n/messages/public";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { storyMessages } from "@/lib/i18n/messages/story";
import { page, place, region, sources } from "../fixtures/public-ui";

for (const locale of ["ja", "en"] as const) {
  const detail = (overrides: Partial<Parameters<typeof PlaceView>[0]> = {}) =>
    render(
      <PlaceView
        locale={locale}
        region={region}
        place={place}
        page={page}
        sources={sources}
        {...overrides}
      />,
    );
  it(`renders identical text for missing and unreadable places (${locale})`, () => {
    // getBySlug returns null for both cases: no status or reason reaches the view.
    const missing = detail({ place: null });
    const unreadable = detail({ place: null });
    expect(missing).toBe(unreadable);
    expect(missing).toContain(shellMessages[locale].notFoundTitle);
    expect(missing).toContain(shellMessages[locale].notFoundBody);
    expect(missing).toContain(`href="/${locale}"`);
    expect(missing).toContain(placePageMessages[locale].backToMap);
    expect(missing).toContain('id="main" tabindex="-1"');
    expect(missing).not.toMatch(/Error:|Application error|Unhandled Runtime Error/);
    expect(missing).not.toContain("Demo Cafe");
    expect(missing).not.toMatch(/draft|private|下書き|非公開/i);
    expect(missing.match(/<h1/g)).toHaveLength(1);
  });
  it(`shows the draft note only for a draft and management links only for authorised viewers (${locale})`, () => {
    expect(detail()).toContain(`href="/${locale}/takedown?page=%2F${locale}%2Fplaces%2Fdemo-cafe"`);
    expect(detail()).not.toContain(publicMessages[locale].draft);
    const html = detail({
      place: { ...place, visibility: "draft", canEdit: true, canManage: true, isOwner: true },
    });
    expect(html).toContain(publicMessages[locale].draft);
    expect(html).toContain(`href="/${locale}/creator/places/demo"`);
    expect(html).toContain(`href="/${locale}/owner/demo"`);
    expect(detail()).not.toContain(`href="/${locale}/owner/demo"`);
    expect(detail()).not.toContain(`href="/${locale}/creator/places/demo"`);
    expect(detail()).not.toContain(`aria-label="${placePageMessages[locale].manage}"`);
    expect(detail({ place: { ...place, canEdit: true } })).not.toContain(
      `href="/${locale}/owner/demo"`,
    );
    expect(detail({ place: { ...place, isOwner: true } })).not.toContain(
      `href="/${locale}/creator/places/demo"`,
    );
  });
  it(`renders the story, notice once and one embed per source (${locale})`, () => {
    const html = detail();
    expect(html).toContain(page.sentences.find((sentence) => sentence.lang === locale)!.text);
    expect(html).toContain('href="#fn-claim"');
    expect(html).toContain(storyMessages[locale].accountsDiffer);
    expect(html).toContain('data-badge="ai-assisted"');
    expect(html).toContain('lang="ja"');
    expect(html).toContain('lang="en"');
    expect(html.split(placeUiMessages[locale].notice)).toHaveLength(2);
    expect(html.match(/<article/g)).toHaveLength(sources.length + 1);
    expect(html).toContain('lang="ja" class="whitespace-pre-wrap">架空のメモ');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<script");
    if (locale === "en") {
      expect(html).toContain(storyMessages.en.showOriginal);
      expect(html).toContain('data-badge="machine-translation"');
    }
    expect(detail({ sources: [sources[2]!] })).not.toContain(placeUiMessages[locale].notice);
    expect(detail({ page: null, sources: [] })).toContain(storyMessages[locale].noStoryYet);
  });
  it(`orders the quiet reading sections after the noren and actions (${locale})`, () => {
    const html = detail({
      place: { ...place, dataSources: [{ provider: "osm", ref: "node/123" }] },
    });
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('id="main" tabindex="-1"');
    expect(html).toContain("max-w-[720px]");
    expect(html).toContain("h-[240px]");
    const positions = [
      html.indexOf('data-badge="story"'),
      html.indexOf("google.com/maps/dir/"),
      html.indexOf("<article"),
      html.indexOf('id="posts-heading"'),
      html.indexOf('id="where-heading"'),
      html.indexOf('id="place-data-heading"'),
      html.indexOf("takedown?page="),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).toContain(placePageMessages[locale].removal);
    const noPin = detail({ place: { ...place, pin: null } });
    expect(noPin).not.toContain('id="where-heading"');
    expect(noPin).not.toContain("google.com/maps/dir/");
    for (const page of [null, undefined])
      expect(detail({ page })).not.toContain('data-badge="story"');
  });
  it(`labels the map and its caption with the place's display name (${locale})`, () => {
    const name = locale === "ja" ? "デモ喫茶" : "Demo Cafe";
    const html = detail();
    expect(html).toContain(`<section lang="${locale}" aria-label="${name}"`);
    expect(html).toContain(`<p class="font-medium">${name}</p>`);
    expect(html).not.toContain(`>${placeUiMessages[locale].mapLabel}<`);
  });
  it(`the place page links to the removal form (${locale})`, () => {
    expect(detail()).toContain(`href="/${locale}/takedown?page=%2F${locale}%2Fplaces%2Fdemo-cafe"`);
  });
  it(`contains no rating, score, star or sentiment words (${locale})`, () => {
    for (const html of [
      detail(),
      detail({ place: null }),
      detail({ place: { ...place, visibility: "draft" } }),
    ]) {
      expect(html).not.toMatch(/\b(?:rating|score|star|sentiment)s?\b|評価|点数|星評価|感情分析/i);
    }
  });
}

it("the Demo badge shows only for mock places", () => {
  for (const isMock of [true, false]) {
    const html = render(
      <PlaceView
        locale="en"
        region={region}
        place={{ ...place, isMock }}
        page={null}
        sources={[]}
      />,
    );
    expect(html.includes('data-badge="demo"')).toBe(isMock);
  }
});
it("the place page credits OpenStreetMap with a link when a place has an osm data source and shows nothing when it has none", () => {
  const detail = (dataSources: PlaceDetailLike["dataSources"]) =>
    render(
      <PlaceView
        locale="en"
        region={region}
        place={{ ...place, dataSources }}
        page={null}
        sources={[]}
      />,
    );
  expect(detail([{ provider: "osm", ref: "node/123", licence: "ODbL-1.0" }])).toContain(
    'href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
  );
  expect(detail([{ provider: "osm", ref: "node/123" }])).toContain(publicMessages.en.osmLicence);
  expect(detail([])).not.toContain('id="place-data-heading"');
  expect(detail([])).not.toContain(publicMessages.en.osmLicence);
  expect(detail([])).not.toContain('href="https://www.openstreetmap.org/node/123"');
  expect(
    detail([{ provider: "other", ref: "ref", attribution: "Mock contributor credit" }]),
  ).toContain("Mock contributor credit");
});
it("the OSM object link is built from the ref", () => {
  for (const ref of ["node/123", "way/456", "relation/789"]) {
    const html = render(
      <PlaceView
        locale="en"
        region={region}
        place={{ ...place, dataSources: [{ provider: "osm", ref }] }}
        page={null}
        sources={[]}
      />,
    );
    expect(html).toContain(`href="https://www.openstreetmap.org/${ref}"`);
  }
});

it("centres the place map on its pin at street zoom", () => {
  const maps: Array<React.ComponentProps<typeof PlaceMap>> = [];
  const visit = (node: ReactNode): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isValidElement<{ children?: ReactNode }>(node)) return;
    if (node.type === PlaceMap) maps.push(node.props as React.ComponentProps<typeof PlaceMap>);
    visit(node.props.children);
  };
  visit(PlaceView({ locale: "en", region, place, page: null, sources: [] }));
  expect(maps).toHaveLength(1);
  expect(maps[0]!.center).toEqual({ ...place.pin, zoom: 16 });
  expect(maps[0]!.markers).toHaveLength(1);
  expect(maps[0]!.markers[0]).toMatchObject(place.pin!);
  expect(maps[0]!.bounds).toBeUndefined();
});

it("includes the localised site footer after the main landmark, including missing places", () => {
  for (const locale of ["en", "ja"] as const) {
    for (const value of [place, null]) {
      const html = render(
        <PlaceView locale={locale} region={region} place={value} page={null} sources={[]} />,
      );
      expect(html.match(/<footer/g)).toHaveLength(1);
      expect(html.indexOf("<footer")).toBeGreaterThan(html.indexOf("</main>"));
      expect(html).toContain(`href="/${locale}/notice"`);
      expect(html).toContain(shellMessages[locale].japaneseReview);
    }
  }
});
