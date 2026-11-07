import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import {
  TrailSheet,
  TrailView,
  type TrailPlaceLike,
  type TrailRegion,
} from "@/components/trail/trail-view";
import { trailMessages } from "@/lib/i18n/messages/trail";
import { region as publicRegion } from "../fixtures/public-ui";

const region: TrailRegion = {
  defaultLocale: publicRegion.defaultLocale,
  nameFallback: publicRegion.nameFallback,
  names: { ja: "長崎", en: "Nagasaki" },
  styleUrl: publicRegion.styleUrl,
  attribution: publicRegion.attribution,
  center: publicRegion.center,
  photoBaseUrl: "https://photos.test",
};
const place = (
  slug: string,
  stampDay: string,
  over: Partial<TrailPlaceLike> = {},
): TrailPlaceLike => ({
  placeId: `id-${slug}`,
  slug,
  names: [
    { lang: "ja", script: "kanji", value: "試験の店", isPrimary: true },
    { lang: "en", script: "latin", value: `${slug} shop`, isPrimary: true },
  ],
  pin: { lat: 32.75, lng: 129.88 },
  areaNames: { ja: "諏訪", en: "Suwa" },
  stampedAt: Date.parse(`${stampDay}T03:00:00Z`),
  stampDay,
  stampTime: Date.parse(`${stampDay}T03:00:00Z`),
  moments: [],
  ...over,
});
const photo = { key: "p/one.jpg", width: 2048, height: 1536, waiting: false };

for (const locale of ["en", "ja"] as const) {
  const m = trailMessages[locale];

  it(`tells someone with no footprints to find a place on the map (${locale})`, () => {
    const html = render(<TrailView locale={locale} region={region} places={[]} />);
    expect(html).toContain("data-trail-empty");
    expect(html).toContain(m.empty);
    expect(html).toContain(`href="/${locale}/map"`);
    expect(html).not.toContain("data-trail-map");
  });

  it(`shows nothing while the trail loads (${locale})`, () => {
    expect(render(<TrailView locale={locale} region={region} />)).toBe("");
  });

  it(`offers a chip for each trip and for all of them, and keeps the person's privacy line (${locale})`, () => {
    const html = render(
      <TrailView
        locale={locale}
        region={region}
        places={[place("a", "2026-10-03"), place("b", "2026-11-05", { areaNames: null })]}
      />,
    );
    expect(html).toContain(m.intro);
    expect(html).toContain(`aria-label="${m.tripsLabel}"`);
    expect(html).toContain(m.allTrips);
    expect(html).toContain(locale === "en" ? "Suwa · Oct 2026" : "諏訪 · 2026年10月");
    expect(html).toContain(locale === "en" ? "Nagasaki · Nov 2026" : "長崎 · 2026年11月");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it(`has no chips for a single trip, and no count, distance or rank (${locale})`, () => {
    const html = render(
      <TrailView
        locale={locale}
        region={region}
        places={[place("a", "2026-10-03"), place("b", "2026-10-04")]}
      />,
    );
    expect(html).not.toContain(m.allTrips);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\d/);
    expect(html).not.toMatch(/\b(km|miles?|rank|score|points|leaderboard)\b/i);
  });

  it(`opens a place's moments with a link to the place page (${locale})`, () => {
    const html = render(
      <TrailSheet
        locale={locale}
        region={region}
        onClose={() => undefined}
        place={place("wan", "2026-11-05", {
          moments: [
            {
              kind: "check_in",
              at: Date.UTC(2026, 10, 6),
              day: "2026-11-06",
              timed: false,
              setNames: { ja: "新地中華街", en: "Shinchi" },
              panel: 3,
            },
            {
              kind: "post",
              at: Date.UTC(2026, 10, 5, 8),
              day: "2026-11-05",
              timed: true,
              url: "https://example.com/post-1",
              platform: "instagram",
              title: null,
              note: "The toast was thick.",
              noteLang: "en",
            },
            {
              kind: "story",
              at: Date.UTC(2026, 10, 5, 3),
              day: "2026-11-05",
              timed: true,
              body: "The owner told me about the old harbour.",
              lang: "en",
              photos: [photo],
            },
            { kind: "still_here", at: Date.UTC(2026, 10, 5, 2), day: "2026-11-05", timed: true },
          ],
        })}
      />,
    );
    expect(html).toContain(`href="/${locale}/places/wan"`);
    expect(html).toContain(m.openPlace);
    expect(html).toContain(m.wroteStory);
    expect(html).toContain(m.sharedPost);
    expect(html).toContain(m.stillHere);
    expect(html).toContain(m.openPost);
    expect(html).toContain("The toast was thick.");
    expect(html).toContain("The owner told me about the old harbour.");
    expect(html).toContain('href="https://example.com/post-1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("https://photos.test/p/one.jpg");
    expect(html).toContain(locale === "en" ? "Shinchi" : "新地中華街");
    expect(html).toContain('<time dateTime="2026-11-06">');
    expect(html).toContain(m.close);
  });
}

it("links a post only when its address is https, and leaves photos out when they are off", () => {
  const html = render(
    <TrailSheet
      locale="en"
      region={{ ...region, photoBaseUrl: undefined }}
      onClose={() => undefined}
      place={place("wan", "2026-11-05", {
        moments: [
          {
            kind: "post",
            at: 1,
            day: "2026-11-05",
            timed: true,
            url: "javascript:alert(1)",
            platform: "test",
            title: null,
            note: null,
            noteLang: null,
          },
          {
            kind: "story",
            at: 2,
            day: "2026-11-05",
            timed: true,
            body: "A story.",
            lang: "en",
            photos: [photo],
          },
        ],
      })}
    />,
  );
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<img");
});
