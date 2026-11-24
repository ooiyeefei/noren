import { renderToStaticMarkup as render } from "react-dom/server";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, it, vi } from "vitest";
import { HomeView } from "@/components/public/home-view";
import { publicMessages } from "@/lib/i18n/messages/public";
import { ConvexProvider } from "convex/react";
import { HomeContainer } from "@/components/public/home-container";
import { toHomeModel, publicRegionProps, type PlaceSummaryLike } from "@/components/public/mapping";
import { getRegion } from "@/lib/region";
import { place, region } from "../fixtures/public-ui";

vi.mock("maplibre-gl", () => {
  throw new Error("MapLibre must not load during SSR");
});

const calls: { name: string; args: unknown }[] = [];
const answers = new Map<string, unknown>();
// useQuery is answered from a table; useQueries is the real one, running on a fake client, because
// the real hook is what looped in a browser when it was handed a new object on every render.
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (ref: never, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(ref);
    calls.push({ name, args });
    // A new copy on every call, as Convex may hand back an equal answer as a new object.
    const answer = answers.get(name);
    return answer === undefined ? undefined : structuredClone(answer);
  },
}));
const client = {
  watchQuery: (ref: never, args: { regionId: string }) => {
    const name = getFunctionName(ref);
    calls.push({ name, args });
    return {
      onUpdate: () => () => undefined,
      localQueryResult: () => answers.get(`${name}:${args.regionId}`),
      journal: () => undefined,
    };
  },
} as unknown as React.ComponentProps<typeof ConvexProvider>["client"];
function Page(props: Partial<React.ComponentProps<typeof HomeContainer>>) {
  return (
    <ConvexProvider client={client}>
      <HomeContainer locale="en" region={region} regions={regions} {...props} />
    </ConvexProvider>
  );
}

const malaysia = publicRegionProps(getRegion("malaysia-west")!, "en");
const regions = { [region.regionId]: region, [malaysia.regionId]: malaysia };
const ipoh: PlaceSummaryLike = {
  ...place,
  _id: "ipoh",
  regionId: malaysia.regionId,
  slug: "ipoh-kopitiam",
  isMock: false,
  names: [
    { lang: "ta", script: "tamil", value: "ஈப்போ கடை", isPrimary: true },
    { lang: "zh", script: "hanzi", value: "怡保店", isPrimary: false },
  ],
  pin: { lat: 4.6, lng: 101.08 },
};
const far: PlaceSummaryLike = {
  ...place,
  _id: "far",
  isMock: false,
  slug: "far-away-shop",
  names: [{ lang: "en", script: "latin", value: "Far Away Shop", isPrimary: true }],
  pin: { lat: 33.9, lng: 131.2 },
};

beforeEach(() => {
  calls.length = 0;
  answers.clear();
  answers.set("places:inCells", [{ ...place, isMock: false }]);
  answers.set("places:coverage", []);
});

const names = (name: string) => calls.filter((call) => call.name === name);
const home = () => render(<Page />);

it("settles when an answer arrives, even if Convex hands back an equal answer as a new object", () => {
  // An answer takes one more render pass to absorb; this threw "Too many re-renders" in a browser.
  expect(() => home()).not.toThrow();
  expect(home()).toContain('href="/en/places/demo-cafe"');
  expect(() => render(<Page initialSearch="demo" />)).not.toThrow();
});

it("makes no listForMap request while the search box is empty", () => {
  home();
  expect(names("places:listForMap")).toEqual([]);
  expect(names("places:inCells").length).toBeGreaterThan(0);
});

it("names a place by its own region's rules, in the map list and on the markers", () => {
  const model = toHomeModel([place, ipoh], "en", region, regions);
  const byId = Object.fromEntries(model.items.map((item) => [item.id, item]));
  expect(byId.demo!.name).toBe("Demo Cafe");
  // Malaysia puts Chinese characters ahead of Tamil for an English reader; Nagasaki's order does not.
  expect(byId.ipoh!.name).toBe("怡保店");
  expect(toHomeModel([ipoh], "en", region).items[0]!.name).toBe("ஈப்போ கடை");
  expect(model.markers.find((marker) => marker.id === "ipoh")!.label).toBe("怡保店");
});

it("finds a place by name from every region that is on, outside the view, once the box has text", () => {
  answers.set(`places:listForMap:${region.regionId}`, [far]);
  answers.set(`places:listForMap:${malaysia.regionId}`, [ipoh]);
  const html = render(<Page initialSearch="far" />);
  // One request for each region that is on, and a place outside the view is listed and opens its page.
  // A render may run twice (the held places are set while rendering), so compare the distinct requests.
  const asked = [...new Set(names("places:listForMap").map((call) => JSON.stringify(call.args)))];
  expect(asked.map((text) => JSON.parse(text))).toEqual([
    { regionId: region.regionId },
    { regionId: malaysia.regionId },
  ]);
  expect(html).toContain('href="/en/places/far-away-shop"');
  const other = render(<Page initialSearch="怡保" />);
  expect(other).toContain('href="/en/places/ipoh-kopitiam"');
  expect(other).not.toContain("far-away-shop");
});

it("shows a zoomed-out list that says what is true, in both languages", () => {
  for (const locale of ["en", "ja"] as const) {
    const html = render(
      <HomeView
        locale={locale}
        region={region}
        model={toHomeModel([], locale, region)}
        view={null}
        zoomedOut
      />,
    );
    expect(html).toContain(publicMessages[locale].zoomedOutEmpty);
    expect(html).not.toContain(publicMessages[locale].noPlacesInArea);
    // Searching while zoomed out is a search, not a zoomed-out list.
    expect(
      render(
        <HomeView
          locale={locale}
          region={region}
          model={toHomeModel([], locale, region)}
          zoomedOut
          search="x"
        />,
      ),
    ).not.toContain(publicMessages[locale].zoomedOutEmpty);
  }
});

it("opens on Nagasaki with the heading the page has always had, in both languages", () => {
  for (const locale of ["en", "ja"] as const) {
    const props = publicRegionProps(getRegion("nagasaki")!, locale);
    const html = render(
      <ConvexProvider client={client}>
        <HomeContainer locale={locale} region={props} regions={{ ...regions, nagasaki: props }} />
      </ConvexProvider>,
    );
    // No view has been reported yet, so the map is on the home region and the heading is unchanged.
    expect(html).toContain(
      `>${publicMessages[locale].exploreTitle.replaceAll("'", "&#x27;")}</h1>`,
    );
  }
});
