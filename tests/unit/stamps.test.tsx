import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fitForNeighbourhood } from "@/components/explore/helpers";
import { NeighbourhoodList } from "@/components/explore/neighbourhood-list";
import { NeighbourhoodMission, type MissionLike } from "@/components/place/neighbourhood-mission";
import { PlaceCheck } from "@/components/place/place-check";
import { PlaceStamp } from "@/components/place/place-stamp";
import { StampsView, type StampLike } from "@/components/stamps/stamps-view";
import { sealFontSize, stampTilt } from "@/components/stamps/stamp";
import { missionMessages, stampMessages } from "@/lib/i18n/messages/stamps";
import { getRegionConfig } from "@/lib/region/registry";
import { neighbourhoodAt } from "@/lib/region/neighbourhoods";
import { regionSchema } from "@/lib/region/schema";
import nagasaki from "../../regions/nagasaki.json";
import { region } from "../fixtures/public-ui";

const stamp = (slug: string, value: string, day: number): StampLike => ({
  placeId: `id-${slug}`,
  slug,
  names: [
    { lang: "ja", script: "kanji", value, isPrimary: true },
    { lang: "en", script: "latin", value: `${slug} shop`, isPrimary: true },
  ],
  stampedAt: Date.UTC(2026, 10, day),
});
const mission = (over: Partial<MissionLike> = {}): MissionLike => ({
  id: "shinchi",
  names: { en: "Shinchi", ja: "新地中華街" },
  checked: 3,
  left: 184,
  nearby: [
    {
      slug: "next-door",
      names: [{ lang: "en", script: "latin", value: "Next Door Cafe", isPrimary: true }],
    },
  ],
  ...over,
});

for (const locale of ["en", "ja"] as const) {
  const m = stampMessages[locale];
  const book = (stamps?: readonly StampLike[]) =>
    render(<StampsView locale={locale} region={region} stamps={stamps} />);

  it(`shows each stamp linked to its place, set vertically, with no count (${locale})`, () => {
    const html = book([stamp("wan", "湾", 4), stamp("sora", "空", 2), stamp("kaze", "風", 1)]);
    expect(html).toContain(`href="/${locale}/places/wan"`);
    expect(html).toContain("[writing-mode:vertical-rl]");
    expect(html).toContain("border-beni");
    expect(html).toContain("<time");
    // The page's own digits are dates; nothing says how many.
    const text = html
      .replace(/<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<time[\s\S]*?<\/time>/g, "")
      .replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\d/);
    expect(html).not.toMatch(/rank|score|points|leaderboard/i);
  });

  it(`tells an empty book to go check a place on the map (${locale})`, () => {
    const html = book([]);
    expect(html).toContain(m.empty);
    expect(html).toContain(`href="/${locale}/map"`);
    expect(book()).not.toContain(m.empty);
  });

  it(`presses the stamp only when just earned, and respects reduced motion (${locale})`, () => {
    const props = { locale, region, slug: "wan", names: stamp("wan", "湾", 4).names };
    const pressed = render(<PlaceStamp {...props} stampedAt={1} pressed />);
    expect(pressed).toContain("data-stamp-pressed");
    expect(pressed).toContain(m.inBook);
    expect(pressed).toContain(`href="/${locale}/stamps"`);
    expect(pressed).toContain("prefers-reduced-motion: no-preference");
    expect(render(<PlaceStamp {...props} stampedAt={1} />)).not.toContain('data-stamp-pressed=""');
  });

  it(`writes the mission line for many, one and none (${locale})`, () => {
    const name = locale === "en" ? "Shinchi" : "新地中華街";
    const see = (over: Partial<MissionLike>) =>
      render(<NeighbourhoodMission locale={locale} region={region} mission={mission(over)} />);
    const many = see({}).replace(/<[^>]+>/g, "");
    expect(many).toContain(
      missionMessages[locale].left.replace("{name}", name).replace("{n}", "184"),
    );
    expect(see({})).toContain('data-mission-left="184"');
    expect(see({})).toContain('aria-valuenow="3"');
    expect(see({ left: 1 }).replace(/<[^>]+>/g, "")).toContain(
      missionMessages[locale].leftOne.replace("{name}", name).replace("{n}", "1"),
    );
    expect(see({ left: 0, nearby: [] })).toContain(
      missionMessages[locale].done.replace("{name}", name),
    );
    expect(see({})).toContain(`href="/${locale}/places/next-door"`);
  });

  it(`lists neighbourhoods with bars, and hides one with no places (${locale})`, () => {
    const html = render(
      <NeighbourhoodList
        locale={locale}
        neighbourhoods={[
          {
            id: "dejima",
            names: { en: "Dejima", ja: "出島" },
            center: { lat: 1, lng: 1 },
            radiusMetres: 9,
            checked: 2,
            left: 8,
          },
          {
            id: "oura",
            names: { en: "Oura", ja: "大浦" },
            center: { lat: 1, lng: 1 },
            radiusMetres: 9,
            checked: 0,
            left: 0,
          },
        ]}
      />,
    );
    expect(html).toContain('data-neighbourhood="dejima"');
    expect(html).not.toContain('data-neighbourhood="oura"');
    expect(html).toContain('role="progressbar"');
  });
}

describe("every string stays in plain English with no em dash", () => {
  for (const messages of [stampMessages.en, missionMessages.en])
    it(`holds for ${Object.keys(messages)[0]}`, () => {
      for (const text of Object.values(messages)) {
        expect(text).not.toContain("—");
        expect(text).not.toMatch(/OpenStreetMap|Overture|Google|Convex|Clerk/);
      }
    });
});

it("opens the check for a signed-in member at an unconfirmed place, and only then", () => {
  const actions = (signedIn: boolean | undefined) => ({
    signedIn,
    confirm: async () => null,
    report: async () => null,
  });
  const NOW = Date.UTC(2026, 10, 4);
  const opens = (props: Partial<Parameters<typeof PlaceCheck>[0]>) =>
    /<details[^>]* open/.test(render(<PlaceCheck locale="en" now={NOW} {...props} />));
  expect(opens({ actions: actions(true) })).toBe(true);
  expect(opens({ actions: actions(false) })).toBe(false);
  expect(opens({ actions: actions(undefined) })).toBe(false);
  expect(opens({ actions: actions(true), confirmedAt: NOW - 1000 })).toBe(false);
});

it("a tilt is small, never level, and the same every time", () => {
  for (const seed of ["a", "wan", "shinchi-long-slug", "長崎"]) {
    expect(Math.abs(stampTilt(seed))).toBeGreaterThan(0);
    expect(Math.abs(stampTilt(seed))).toBeLessThanOrEqual(4);
    expect(stampTilt(seed)).toBe(stampTilt(seed));
  }
});

it("frames a neighbourhood's whole circle when the map moves there", () => {
  const { points } = fitForNeighbourhood({
    center: { lat: 32.74, lng: 129.87 },
    radiusMetres: 300,
  });
  expect(points).toHaveLength(2);
  expect(points[1]!.lat - points[0]!.lat).toBeCloseTo((2 * 300) / 111_320, 5);
  expect(points[1]!.lng).toBeGreaterThan(points[0]!.lng);
});

describe("neighbourhoods", () => {
  const config = getRegionConfig("nagasaki");
  it("a pin belongs to the nearest centre whose circle holds it, or to none", () => {
    expect(neighbourhoodAt(config, { lat: 32.7415, lng: 129.8755 })?.id).toBe("shinchi");
    // Inside both the Hamanomachi and Shianbashi circles, and closer to Shianbashi.
    expect(neighbourhoodAt(config, { lat: 32.7426, lng: 129.8795 })?.id).toBe("shianbashi");
    expect(neighbourhoodAt(config, { lat: 32.9, lng: 129.75 })).toBeUndefined();
    expect(neighbourhoodAt(undefined, { lat: 32.7415, lng: 129.8755 })).toBeUndefined();
  });
  it("the region names about nine, each in both languages and inside its bbox", () => {
    expect(config?.neighbourhoods).toHaveLength(9);
    const one = nagasaki.neighbourhoods[0]!;
    const withHoods = (neighbourhoods: unknown) =>
      regionSchema.safeParse({ ...nagasaki, neighbourhoods }).success;
    expect(withHoods(nagasaki.neighbourhoods)).toBe(true);
    expect(withHoods([one, one])).toBe(false);
    expect(withHoods([{ ...one, names: { en: "Only English" } }])).toBe(false);
    expect(withHoods([{ ...one, center: { lat: 10, lng: 10 } }])).toBe(false);
    expect(withHoods([{ ...one, radiusMetres: 0 }])).toBe(false);
  });
});

it("fits a seal's name: short names large, long ones smaller and in more columns", () => {
  expect(sealFontSize("ふくや", "large")).toBe(34);
  expect(sealFontSize("喫茶ひかり", "small")).toBeGreaterThanOrEqual(15);
  const long = sealFontSize("長崎湾岸まちかど珈琲焙煎所と小さな図書室本店", "large");
  expect(long).toBeGreaterThanOrEqual(14);
  expect(long).toBeLessThan(34);
  // A Latin name runs on longer before it has to shrink as far.
  expect(sealFontSize("Kojitei Lantern", "small")).toBeGreaterThan(
    sealFontSize("小路亭小路亭小路亭小路亭小路亭", "small"),
  );
});
