import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HomeView, PublicLoading } from "@/components/public/home-view";
import { toHomeModel, type LatestStoryLike } from "@/components/public/mapping";
import { format } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { exploreItems, type MapView } from "@/components/explore/helpers";
import { PlaceMap } from "@/components/map/place-map";
import { landmark, place, region } from "../fixtures/public-ui";

vi.mock("maplibre-gl", () => {
  throw new Error("MapLibre must not load during SSR");
});
vi.mock("@/components/map/place-map", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/map/place-map")>();
  return {
    ...actual,
    PlaceMap: vi.fn((props: React.ComponentProps<typeof actual.PlaceMap>) => (
      <actual.PlaceMap {...props} />
    )),
  };
});

const view: MapView = {
  west: 129.87,
  south: 32.74,
  east: 129.89,
  north: 32.76,
  center: { lat: 32.75, lng: 129.88 },
  zoom: 14,
};
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
  it(`offers With stories right after All, and shows the newest stories above the list (${locale})`, () => {
    const html = home();
    expect(html).toContain('data-category="stories" aria-pressed="false"');
    expect(html.indexOf('data-category=""')).toBeLessThan(html.indexOf('data-category="stories"'));
    expect(html.indexOf('data-category="stories"')).toBeLessThan(
      html.indexOf('data-category="cafe"'),
    );
    expect(html).toContain(`>${m.storiesChip}</button>`);
    expect(html).not.toContain('id="latest-stories"');
    const names = [
      { lang: "ja", script: "kanji" as const, value: "猫のカフェ", isPrimary: true },
      { lang: "en", script: "latin" as const, value: "Cat Cafe", isPrimary: true },
    ];
    const latest: LatestStoryLike[] = [
      {
        kind: "written",
        id: "s1",
        placeSlug: "cat-cafe",
        placeNames: names,
        text: "保護猫が新しい家族を待っています。",
        lang: "ja",
        sharedBy: "Fictional walker",
        addedAt: 3,
      },
      {
        kind: "post",
        id: "p1",
        placeSlug: "cat-cafe",
        placeNames: names,
        text: "A video of the cats.",
        lang: "en",
        platform: "youtube",
        sharedBy: "Fictional sharer",
        addedAt: 2,
      },
      {
        kind: "post",
        id: "p2",
        placeSlug: "cat-cafe",
        placeNames: names,
        platform: "web",
        sharedBy: "Fictional blogger",
        addedAt: 1,
      },
    ];
    const withLatest = render(
      <HomeView locale={locale} region={region} model={model} latest={latest} />,
    );
    expect(withLatest).toContain(
      `<h2 id="latest-stories" class="px-4 pb-2 text-[15px] font-bold">${m.latestStories}</h2>`,
    );
    expect(withLatest.match(new RegExp(`href="/${locale}/places/cat-cafe"`, "g"))).toHaveLength(3);
    expect(withLatest).toContain(locale === "ja" ? ">猫のカフェ<" : ">Cat Cafe<");
    expect(withLatest).toContain(
      'lang="ja" class="line-clamp-3 text-[15px] leading-relaxed">保護猫が',
    );
    expect(withLatest).toContain(format(m.writtenBy, { name: "Fictional walker" }));
    expect(withLatest).toContain(
      format(m.postSharedBy, { platform: "YouTube", name: "Fictional sharer" }),
    );
    expect(withLatest).toContain(format(m.linkSharedBy, { name: "Fictional blogger" }));
    expect(withLatest.indexOf('id="latest-stories"')).toBeLessThan(
      withLatest.indexOf('role="status"'),
    );
    const searching = render(
      <HomeView locale={locale} region={region} model={model} latest={latest} search="cat" />,
    );
    expect(searching).not.toContain('id="latest-stories"');
    expect(m.legendStory).toBe(m.storiesChip);
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

for (const locale of ["en", "ja"] as const) {
  it(`caps rows at 50, counts all matches and offers a 44px show-more button (${locale})`, () => {
    for (const n of [0, 1, 50, 51, 151]) {
      const model = toHomeModel(
        Array.from({ length: n }, (_, index) => ({ ...place, _id: `mock-${index}` })),
        locale,
        region,
      );
      const html = render(<HomeView locale={locale} region={region} model={model} view={view} />);
      expect(html.match(/<li id="explore-place-/g) ?? []).toHaveLength(Math.min(50, n));
      expect(html.includes(publicMessages[locale].showMorePlaces)).toBe(n > 50);
      if (n > 50) {
        expect(html).toMatch(
          new RegExp(
            `<button[^>]*class="[^"]*min-h-11[^"]*">${publicMessages[locale].showMorePlaces}</button>`,
          ),
        );
        const expanded = render(
          <HomeView locale={locale} region={region} model={model} view={view} rowLimit={100} />,
        );
        expect(expanded.match(/<li id="explore-place-/g)).toHaveLength(Math.min(100, n));
        expect(expanded.includes(publicMessages[locale].showMorePlaces)).toBe(n > 100);
      }
      const expected =
        locale === "en"
          ? `${n} ${n === 1 ? "place" : "places"} in this area`
          : `この範囲に ${n} 件`;
      expect(html).toContain(`role="status" class="text-[15px] font-bold">${expected}</p>`);
    }
  });

  for (const n of [0, 1, 2]) {
    it(`counts ${n} search matches anywhere (${locale})`, () => {
      const model = toHomeModel(
        Array.from({ length: n }, (_, index) => ({ ...place, _id: `mock-${index}` })),
        locale,
        region,
      );
      const html = render(
        <HomeView locale={locale} region={region} model={model} view={view} search="demo" />,
      );
      const expected =
        locale === "en" ? `${n} ${n === 1 ? "place matches" : "places match"}` : `${n} 件が一致`;
      expect(html).toContain(`role="status" class="text-[15px] font-bold">${expected}</p>`);
    });
  }

  it(`uses the empty-area guidance while retaining search empty states (${locale})`, () => {
    const props = {
      locale,
      region,
      model: toHomeModel([], locale, region),
      totalCount: 2,
      view,
      category: "cafe",
    };
    const html = render(<HomeView {...props} search="  " />);
    expect(html).toContain(
      locale === "en"
        ? "No places in this area. Move or zoom out the map."
        : "この範囲にお店はありません。地図を動かすか、縮小してください。",
    );
    const searched = render(<HomeView {...props} search="missing" />);
    expect(searched).toContain(publicMessages[locale].noCafeMatches);
    expect(searched).not.toContain(publicMessages[locale].noPlacesInArea);
  });
}

it("passes every search/category match to PlaceMap while the list follows the view", () => {
  const all = toHomeModel(
    [
      place,
      { ...place, _id: "outside", pin: { lat: 32.8, lng: 129.9 } },
      { ...landmark, category: "attraction" },
    ],
    "en",
    region,
  );
  for (const search of ["", "demo"]) {
    const items = exploreItems(all.items, { category: "cafe", search, locale: "en", view });
    const mapItems = exploreItems(all.items, { category: "cafe", search, locale: "en" });
    const model = {
      ...all,
      items,
      markers: all.markers.filter((marker) => mapItems.some((item) => item.id === marker.id)),
    };
    const onViewChange = vi.fn();
    const onSelect = vi.fn();
    const html = render(
      <HomeView
        locale="en"
        region={region}
        model={model}
        view={view}
        category="cafe"
        search={search}
        onViewChange={onViewChange}
        onSelect={onSelect}
        selectedId="demo"
      />,
    );
    expect(html.includes('id="explore-place-outside"')).toBe(search !== "");
    const props = vi.mocked(PlaceMap).mock.lastCall![0];
    expect(props.markers.map((marker) => marker.id)).toEqual(["demo", "outside"]);
    expect(props.explore).toEqual(
      expect.objectContaining({ onViewChange, onSelect, selectedId: "demo" }),
    );
  }
});
it("category chips preserve focus order even if region input is reversed", () => {
  const html = render(
    <HomeView
      locale="en"
      region={{ ...region, categories: [...region.categories!].reverse() }}
      model={toHomeModel([], "en", region)}
    />,
  );
  expect(html.indexOf('data-category="other"')).toBeGreaterThan(0);
  expect(html.indexOf('data-category="cafe"')).toBeLessThan(html.indexOf('data-category="other"'));
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
