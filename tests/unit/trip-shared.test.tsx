import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SharedView, driveMapsUrl, type SharedTrip } from "@/components/trip/shared-view";
import { requireSharedTripDoor } from "@/lib/convex/trip-gate";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { tripSharedMessages } from "@/lib/i18n/messages/trip-shared";
import { getRegionConfig } from "@/lib/region/registry";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));
vi.mock("next/root-params", () => ({ lang: async () => "en" }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const malaysia = getRegionConfig("malaysia-west");
if (!malaysia?.roads) throw new Error("malaysia-west region file missing");
const [a, b] = malaysia.roads.points;
if (!a || !b) throw new Error("two road points needed");
const aId = a.id;
const bId = b.id;
const region = {
  defaultLocale: malaysia.defaultLocale,
  nameFallback: malaysia.nameFallback,
  categories: malaysia.categories,
  roads: malaysia.roads,
  towns: malaysia.towns,
};

const placeId = "place1" as never;
const goneId = "place2";
const stop = {
  placeId,
  slug: "old-shop",
  names: [{ lang: "en", script: "Latn", value: "Old Shop", isPrimary: true }],
  category: "cafe",
  pin: { lat: 3, lng: 101 },
  confirmed: false,
  quotes: [
    { kind: "story", storyId: "s1", text: "Quiet at noon.", lang: "en", authorName: "Aiko" },
    { kind: "story", storyId: "s2", text: "Cold tea.", lang: "en", authorName: "Ben" },
    { kind: "story", storyId: "s3", text: "THIRD QUOTE", lang: "en", authorName: "Cai" },
  ],
  facts: [
    {
      factId: "f1",
      key: "step-free",
      value: "yes",
      day: "2026-11-01",
      basis: "member",
      reporterName: "Dee",
    },
  ],
} as unknown as SharedTrip["stops"][number];

function trip(overrides: Partial<SharedTrip> = {}): SharedTrip {
  return {
    regionId: malaysia!.id,
    title: "Family trip",
    stops: [stop],
    days: [
      {
        index: 1,
        date: "2026-12-13",
        night: bId,
        items: [
          { kind: "drive", from: aId, to: bId, minutes: 95, kilometres: 120, estimated: true },
          {
            kind: "stop",
            at: "10:30",
            minutes: 45,
            placeId,
            turnLabel: "Mum",
            checks: [
              { rule: "step-free", verdict: "met", restsOn: { kind: "member", factId: "f1" } },
              { rule: "quiet", verdict: "not_known", reason: "no_record" },
            ],
          },
          { kind: "rest", at: "12:00", minutes: 20, why: "stretch" },
          { kind: "stop", at: "15:00", minutes: 30, pinLabel: "Aunt's house", checks: [] },
        ],
      },
      ...Array.from({ length: 4 }, (_, i) => ({
        index: i + 2,
        items: [] as SharedTrip["days"][number]["items"],
      })),
    ],
    ...overrides,
  } as SharedTrip;
}

describe("the shared trip view", () => {
  it.each(SUPPORTED_LOCALES)("shows the plan and the organiser's label in %s", (locale) => {
    const html = render(<SharedView locale={locale} trip={trip()} region={region} />);
    expect(html).toContain("Old Shop");
    expect(html).toContain("Mum");
    expect(html).toContain("Aunt&#x27;s house");
    expect(html).toContain("10:30");
    expect(html).toContain("Quiet at noon.");
    expect(html).toContain("Cold tea.");
    expect(html).not.toContain("THIRD QUOTE");
    expect(html).toContain(tripSharedMessages[locale].unconfirmed);
    expect(html).toContain(tripSharedMessages[locale].openInMaps);
    expect(html).toContain(tripSharedMessages[locale].estimateNote);
    expect(html).toContain(tripSharedMessages[locale].sharedNote);
  });

  it("lists a rule with no record as not checked, apart from one that is met", () => {
    const html = render(<SharedView locale="en" trip={trip()} region={region} />);
    expect(html).toContain("Meets this");
    expect(html).toContain("Not checked");
  });

  it("leaves out a place that is no longer public and keeps the rest of the day", () => {
    const gone = trip();
    gone.days[0]!.items.splice(1, 0, {
      kind: "stop",
      at: "11:30",
      minutes: 30,
      placeId: goneId,
      checks: [],
    } as never);
    const html = render(<SharedView locale="en" trip={gone} region={region} />);
    expect(html).not.toContain("11:30");
    expect(html).toContain("10:30");
    expect(html).toContain("Aunt");
  });

  it("carries no age, like or purpose, and shows no organiser name of its own", () => {
    const html = render(<SharedView locale="en" trip={trip()} region={region} />);
    expect(html).not.toMatch(/baby|toddler|teen|older|likes|purpose|rating|score/i);
    expect(html).not.toMatch(/organiser/i);
  });

  it("builds a maps link only from two pinned road points", () => {
    expect(driveMapsUrl(region, a.id, b.id)).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\//);
    expect(driveMapsUrl(region, a.id, "nowhere")).toBeNull();
  });

  it("has English and Japanese for every message", () => {
    expect(Object.keys(tripSharedMessages.ja).sort()).toEqual(
      Object.keys(tripSharedMessages.en).sort(),
    );
  });
});

describe("the shared page's door", () => {
  it("answers 404 while the switch is off, as it is in this region file", () => {
    expect(() => requireSharedTripDoor()).toThrow("NEXT_NOT_FOUND");
  });

  it("is noindex with a same-origin referrer", async () => {
    const { generateMetadata } = await import("@/app/[lang]/trip/shared/[code]/page");
    const meta = await generateMetadata({
      params: Promise.resolve({ lang: "en", code: "x" }),
    } as never);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.referrer).toBe("same-origin");
  });
});
