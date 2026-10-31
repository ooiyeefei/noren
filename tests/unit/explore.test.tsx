import { expect, it, vi } from "vitest";
import {
  dismissGuide,
  distanceLabel,
  draggedSheet,
  exploreItems,
  explorePadding,
  fitForFilter,
  GUIDE_STORAGE_KEY,
  guideIsVisible,
  locateInBrowser,
  haversine,
  normaliseSearch,
  STORIES_FILTER,
  type MapView,
} from "@/components/explore/helpers";
import { toHomeModel } from "@/components/public/mapping";
import { place, region } from "../fixtures/public-ui";

const items = toHomeModel(
  [
    {
      ...place,
      _id: "z",
      hasStory: true,
      category: "cafe",
      pin: { lat: 0, lng: 2 },
      names: [{ lang: "en", script: "latin", value: "Zulu", isPrimary: true }],
    },
    {
      ...place,
      _id: "b",
      isMock: false,
      category: "bar",
      pin: { lat: 0, lng: 1 },
      names: [
        { lang: "en", script: "latin", value: "Beta", isPrimary: true },
        { lang: "ja", script: "kana", value: "カフェ", isPrimary: false },
        { lang: "en", script: "latin", value: "Hidden alias", isPrimary: false },
      ],
    },
    {
      ...place,
      _id: "a",
      isMock: false,
      pin: null,
      names: [{ lang: "en", script: "latin", value: "Alpha", isPrimary: true }],
    },
  ],
  "en",
  region,
).items;
const filter = (search = "", category = "") =>
  exploreItems(items, { search, category, locale: "en" });

it("normalises width, Latin case, half-width kana and katakana to hiragana", () => {
  expect(normaliseSearch(" Ｃａｆｅ ＡＢＣ ")).toBe("cafe abc");
  expect(normaliseSearch("カフェ")).toBe("かふぇ");
  expect(normaliseSearch("ｶﾌｪ")).toBe("かふぇ");
  expect(filter("かふぇ").map((item) => item.id)).toEqual(["b"]);
  expect(filter("ＨＩＤＤＥＮ").map((item) => item.id)).toEqual(["b"]);
  expect(filter("  ")).toHaveLength(3);
});
it("filters a single category or Demo together with search; clearing restores every place", () => {
  expect(filter("", "cafe").map((item) => item.id)).toEqual(["z", "a"]);
  expect(filter("", "demo").map((item) => item.id)).toEqual(["z"]);
  expect(filter("Beta", "demo")).toEqual([]);
  expect(filter("Zulu", "bar")).toEqual([]);
  expect(filter()).toHaveLength(3);
});
it("the With stories chip keeps the places someone has shared a story about", () => {
  expect(filter("", STORIES_FILTER).map((item) => item.id)).toEqual(["z"]);
  expect(filter("Beta", STORIES_FILTER)).toEqual([]);
  expect(region.categories?.some((category) => category.key === STORIES_FILTER)).toBe(false);
});
it("sorts stories first, then distance from the position, with missing pins last", () => {
  expect(filter().map((item) => item.id)).toEqual(["z", "a", "b"]);
  const nearest = exploreItems(items, {
    search: "",
    category: "",
    locale: "en",
    position: { lat: 0, lng: 0 },
  });
  expect(nearest.map((item) => item.id)).toEqual(["z", "b", "a"]);
  expect(nearest[1]!.distance).toBeCloseTo(111195, -1);
  expect(nearest[2]!.distance).toBeUndefined();
  expect(items.every((item) => item.distance === undefined)).toBe(true);
});

const view: MapView = {
  west: 0,
  south: -1,
  east: 2,
  north: 1,
  center: { lat: 0, lng: 1 },
  zoom: 12,
};
const areaItems = [
  { ...items[0]!, id: "west", pin: { lat: 0, lng: 0 } },
  { ...items[1]!, id: "east", pin: { lat: 0, lng: 2 } },
  { ...items[1]!, id: "south", pin: { lat: -1, lng: 1 } },
  { ...items[1]!, id: "north", pin: { lat: 1, lng: 1 } },
  ...[
    { lat: 0, lng: -0.001 },
    { lat: 0, lng: 2.001 },
    { lat: -1.001, lng: 1 },
    { lat: 1.001, lng: 1 },
  ].map((pin, index) => ({ ...items[1]!, id: `outside-${index}`, pin })),
  items[2]!,
];

it("includes every bbox edge and excludes places just outside and places without a pin", () => {
  const result = exploreItems(areaItems, { search: "  ", category: "", locale: "en", view });
  expect(result.map((item) => item.id).sort()).toEqual(["east", "north", "south", "west"]);
});

it("search ignores the view, including aliases and places without pins; no view keeps all places", () => {
  expect(
    exploreItems(areaItems, { search: "Hidden", category: "", locale: "en", view }),
  ).toHaveLength(7);
  expect(
    exploreItems(areaItems, { search: "Alpha", category: "", locale: "en", view }).map(
      (item) => item.id,
    ),
  ).toEqual(["a"]);
  for (const unknownView of [undefined, null]) {
    expect(
      exploreItems(areaItems, { search: "", category: "", locale: "en", view: unknownView }),
    ).toHaveLength(areaItems.length);
  }
});

it("applies categories and Demo with a view, with a search, and before the view is known", () => {
  for (const options of [{ view, search: "" }, { view, search: "Hidden" }, { search: "" }]) {
    for (const category of ["cafe", "bar", "demo"]) {
      const result = exploreItems(areaItems, { ...options, category, locale: "en" });
      const expected =
        category === "demo"
          ? ["west"]
          : category === "cafe"
            ? options.view
              ? ["west"]
              : ["west", "a"]
            : options.search || !options.view
              ? ["east", "north", "outside-0", "outside-1", "outside-2", "outside-3", "south"]
              : ["east", "north", "south"];
      expect(result.map((item) => item.id).sort()).toEqual(
        options.search && category !== "bar" ? [] : [...expected].sort(),
      );
    }
  }
});

it("keeps stories first, then uses the position ahead of the view centre", () => {
  const places = [
    { ...items[0]!, id: "far-story", pin: { lat: 0, lng: 1.7 } },
    { ...items[0]!, id: "near-story", pin: { lat: 0, lng: 0.1 } },
    { ...items[1]!, id: "near-person", pin: { lat: 0, lng: 0.2 } },
    { ...items[1]!, id: "near-centre", pin: { lat: 0, lng: 1 } },
  ];
  expect(
    exploreItems(places, { search: "", category: "", locale: "en", view }).map((item) => item.id),
  ).toEqual(["far-story", "near-story", "near-centre", "near-person"]);
  expect(
    exploreItems(places, {
      search: "",
      category: "",
      locale: "en",
      view,
      position: { lat: 0, lng: 0 },
    }).map((item) => item.id),
  ).toEqual(["near-story", "far-story", "near-person", "near-centre"]);
  expect(places.every((item) => item.distance === undefined)).toBe(true);
  expect(
    exploreItems(places, { search: "", category: "", locale: "en", view }).every(
      (item) => item.distance === undefined,
    ),
  ).toBe(true);
});
it("uses the page locale to break name ties in each ordering", () => {
  const same = items.map((item) => ({ ...item, hasStory: false, pin: { lat: 0, lng: 0 } }));
  for (const locale of ["en", "ja"] as const) {
    const expected = same.map((item) => item.name).sort((a, b) => a.localeCompare(b, locale));
    expect(
      exploreItems(same, { search: "", category: "", locale }).map((item) => item.name),
    ).toEqual(expected);
  }
});
it("haversine returns metres for equator, longitude at Nagasaki, identical and antipodal points", () => {
  expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111194.927, 2);
  expect(haversine({ lat: 32.75, lng: 129.88 }, { lat: 32.75, lng: 129.89 })).toBeCloseTo(935.2, 0);
  expect(haversine({ lat: 32, lng: 129 }, { lat: 32, lng: 129 })).toBe(0);
  expect(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015086.8, 0);
});
it("labels metres and kilometres", () => {
  expect(distanceLabel(0)).toBe("0 m");
  expect(distanceLabel(319.8)).toBe("320 m");
  expect(distanceLabel(999)).toBe("999 m");
  expect(distanceLabel(1000)).toBe("1.0 km");
  expect(distanceLabel(1234)).toBe("1.2 km");
});
it("persists the first-visit guide and renders it when storage access, reads or writes fail", () => {
  let saved: string | null = null;
  const storage = {
    getItem: (key: string) => {
      expect(key).toBe(GUIDE_STORAGE_KEY);
      return saved;
    },
    setItem: (key: string, value: string) => {
      expect(key).toBe("noren.guide.v1");
      saved = value;
    },
  };
  expect(guideIsVisible(() => storage)).toBe(true);
  expect(dismissGuide(() => storage)).toBe(false);
  expect(guideIsVisible(() => storage)).toBe(false);
  const throws = () => {
    throw new Error("storage blocked");
  };
  expect(guideIsVisible(throws)).toBe(true);
  expect(dismissGuide(throws)).toBe(true);
  expect(guideIsVisible(() => ({ getItem: throws }))).toBe(true);
  expect(dismissGuide(() => ({ setItem: throws }))).toBe(true);
});
it("drags through all three sheet heights and clamps at the ends", () => {
  expect(draggedSheet("peek", -70)).toBe("half");
  expect(draggedSheet("half", -70)).toBe("full");
  expect(draggedSheet("full", -70)).toBe("full");
  expect(draggedSheet("full", 70)).toBe("half");
  expect(draggedSheet("half", 70)).toBe("peek");
  expect(draggedSheet("peek", 70)).toBe("peek");
  expect(draggedSheet("half", 10)).toBe("half");
});

it("geolocation errors, missing support and throwing access leave browsing usable", () => {
  const onPosition = vi.fn();
  const onError = vi.fn();
  locateInBrowser(() => undefined, onPosition, onError);
  locateInBrowser(
    () => {
      throw new Error("blocked");
    },
    onPosition,
    onError,
  );
  locateInBrowser(
    () => ({
      getCurrentPosition: () => {
        throw new Error("unavailable");
      },
    }),
    onPosition,
    onError,
  );
  for (const code of [1, 2, 3])
    locateInBrowser(
      () => ({
        getCurrentPosition: (_success, failure) =>
          failure!({ code, message: "Location is off" } as GeolocationPositionError),
      }),
      onPosition,
      onError,
    );
  expect(onError).toHaveBeenCalledTimes(6);
  expect(onPosition).not.toHaveBeenCalled();
});
it("geolocation success only supplies browser coordinates and uses a bounded request", () => {
  const onPosition = vi.fn();
  const onError = vi.fn();
  const getCurrentPosition: Geolocation["getCurrentPosition"] = (success, _failure, options) => {
    expect(options).toEqual({ timeout: 10000, maximumAge: 60000 });
    success({ coords: { latitude: 32.75, longitude: 129.88 } } as GeolocationPosition);
  };
  locateInBrowser(() => ({ getCurrentPosition }), onPosition, onError);
  expect(onPosition).toHaveBeenCalledExactlyOnceWith({ lat: 32.75, lng: 129.88 });
  expect(onError).not.toHaveBeenCalled();
});

it("pads the phone map for search and each sheet height", () => {
  expect(explorePadding("peek", 800)).toEqual({ top: 132, bottom: 264, left: 0, right: 0 });
  expect(explorePadding("half", 800)).toEqual({ top: 132, bottom: 440, left: 0, right: 0 });
  expect(explorePadding("full", 800)).toEqual({ top: 132, bottom: 668, left: 0, right: 0 });
  expect(explorePadding("peek", 300)).toEqual({ top: 132, bottom: 168, left: 0, right: 0 });
  expect(explorePadding("half", 800, 120).top).toBe(120);
  expect(explorePadding("full", 800, 120).bottom).toBe(668);
});

it("a category with no place in view moves the map to its nearest five matches, else stays put", () => {
  // Named so that sorting by name lists the farthest bath first.
  const baths = Array.from({ length: 7 }, (_, i) => ({
    ...place,
    _id: `bath-${i}`,
    category: "bath",
    pin: { lat: 0, lng: 10 + i },
    names: [
      {
        lang: "en",
        script: "latin" as const,
        value: `Bath ${6 - i}`,
        isPrimary: true,
      },
    ],
  }));
  const cafe = { ...place, _id: "cafe", category: "cafe", pin: { lat: 0, lng: 0.5 } };
  const all = toHomeModel([...baths, cafe], "en", region).items;
  const view: MapView = {
    west: 0,
    south: -1,
    east: 1,
    north: 1,
    center: { lat: 0, lng: 0.5 },
    zoom: 14,
  };
  const options = { search: "", locale: "en" as const, view };
  expect(fitForFilter(all, { ...options, category: "bath" })).toEqual({
    points: [10, 11, 12, 13, 14].map((lng) => ({ lat: 0, lng })),
  });
  // Nearest to the person, when the browser shared where they are.
  expect(
    fitForFilter(all, { ...options, category: "bath", position: { lat: 0, lng: 16 } })?.points[0],
  ).toEqual({ lat: 0, lng: 16 });
  expect(fitForFilter(all, { ...options, category: "cafe" })).toBeNull();
  expect(fitForFilter(all, { ...options, category: "museum" })).toBeNull();
  expect(fitForFilter(all, { ...options, category: "bath", view: null })).toBeNull();
});
