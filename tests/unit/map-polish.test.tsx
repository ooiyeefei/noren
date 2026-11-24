import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { HomeView, exploreHeading } from "@/components/public/home-view";
import { publicRegionProps, toHomeModel } from "@/components/public/mapping";
import { layoutTowns, regionAtCentre, type TownMarker } from "@/components/map/map-helpers";
import { publicMessages } from "@/lib/i18n/messages/public";
import { getRegion } from "@/lib/region";
import { region } from "../fixtures/public-ui";

vi.mock("maplibre-gl", () => {
  throw new Error("MapLibre must not load during SSR");
});

const town = (
  id: string,
  lat: number,
  lng: number,
  radiusMetres = 5000,
  label = id,
): TownMarker => ({
  id,
  label,
  lat,
  lng,
  radiusMetres,
});

// Nagasaki and Shimabara are about 45 km apart; at a far-out zoom they are a few pixels apart.
const nagasaki = town("nagasaki", 32.75, 129.88, 12000, "Nagasaki");
const shimabara = town("shimabara", 32.79, 130.37, 6000, "Shimabara");

it("shows one of two towns that would overlap, and both once the map is zoomed in", () => {
  expect(layoutTowns([nagasaki, shimabara], 6).map((entry) => entry.id)).toEqual(["nagasaki"]);
  expect(layoutTowns([nagasaki, shimabara], 11).map((entry) => entry.id)).toEqual([
    "nagasaki",
    "shimabara",
  ]);
});

it("keeps the larger town, then the earlier id, whatever order the towns arrive in", () => {
  const same = [town("b", 4.6, 101.08), town("a", 4.6, 101.09)];
  expect(layoutTowns(same, 5).map((entry) => entry.id)).toEqual(["a"]);
  expect(layoutTowns([...same].reverse(), 5)).toEqual(layoutTowns(same, 5));
  const big = [town("a", 4.6, 101.08, 1000), town("z", 4.6, 101.09, 9000)];
  expect(layoutTowns(big, 5).map((entry) => entry.id)).toEqual(["z"]);
  // Zooming in never drops a town that was shown, and nothing is shown twice.
  const many = [
    town("ipoh", 4.6, 101.08, 9000),
    town("penang", 5.41, 100.33, 12000),
    town("taiping", 4.85, 100.74, 6000),
    town("kl", 3.14, 101.69, 15000),
  ];
  let previous = new Set<string>();
  for (const zoom of [3, 5, 7, 9, 11, 13]) {
    const ids = layoutTowns(many, zoom).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of previous) expect(ids).toContain(id);
    previous = new Set(ids);
  }
  expect(previous.size).toBe(many.length);
});

const malaysia = publicRegionProps(getRegion("malaysia-west")!, "en");
const regions = { [region.regionId]: region, [malaysia.regionId]: malaysia };

it("finds the region a view's centre is inside, or none", () => {
  expect(regionAtCentre({ lat: 4.6, lng: 101.08 }, regions)?.regionId).toBe("malaysia-west");
  expect(regionAtCentre({ lat: 32.75, lng: 129.88 }, regions)?.regionId).toBe("nagasaki");
  expect(regionAtCentre({ lat: 33.6, lng: 130.4 }, regions)).toBeNull();
  // A region that is not on is not in the list, so a view over it names nothing.
  expect(regionAtCentre({ lat: 4.6, lng: 101.08 }, { nagasaki: region })).toBeNull();
});

const escape = (text: string) => text.replaceAll("'", "&#x27;");

it("names the heading after the region in view, and uses no place name over none", () => {
  expect(exploreHeading("en", "West Coast Malaysia")).toBe("West Coast Malaysia's local places");
  expect(exploreHeading("ja", "マレーシア西海岸")).toBe("マレーシア西海岸の地元のお店");
  expect(exploreHeading("en", null)).toBe("Local places");
  expect(exploreHeading("ja", null)).toBe("地元のお店");
});

it("keeps today's words for Nagasaki", () => {
  for (const locale of ["en", "ja"] as const) {
    const props = publicRegionProps(getRegion("nagasaki")!, locale);
    expect(exploreHeading(locale, props.regionName!)).toBe(publicMessages[locale].exploreTitle);
  }
});

it("puts the heading it is given on the map page, in both languages", () => {
  for (const locale of ["en", "ja"] as const) {
    const heading = exploreHeading(
      locale,
      locale === "en" ? "West Coast Malaysia" : "マレーシア西海岸",
    );
    const html = render(
      <HomeView
        locale={locale}
        region={region}
        model={toHomeModel([], locale, region)}
        heading={heading}
      />,
    );
    expect(html).toContain(`>${escape(heading)}</h1>`);
    expect(html).not.toContain(publicMessages[locale].exploreTitle);
    const none = render(
      <HomeView
        locale={locale}
        region={region}
        model={toHomeModel([], locale, region)}
        heading={exploreHeading(locale, null)}
      />,
    );
    expect(none).toContain(`>${publicMessages[locale].exploreTitlePlain}</h1>`);
    // Without a heading (the map has not said where it looks) the page is as it was.
    expect(
      render(<HomeView locale={locale} region={region} model={toHomeModel([], locale, region)} />),
    ).toContain(`>${escape(publicMessages[locale].exploreTitle)}</h1>`);
  }
});
