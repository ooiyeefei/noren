import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { checkState, STALE_AFTER_MS } from "@/components/place/check-state";
import { PlaceCheck, type PlaceCheckActions } from "@/components/place/place-check";
import { PlaceList } from "@/components/places/place-list";
import { toHomeModel } from "@/components/public/mapping";
import { PlaceView } from "@/components/public/place-view";
import { ReportsView } from "@/components/steward/reports-view";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { checkMessages } from "@/lib/i18n/messages/checks";
import { landmark, place, region } from "../fixtures/public-ui";

const NOW = Date.UTC(2026, 9, 31);
const DAY_MS = 24 * 60 * 60 * 1000;
const button = (text: string) => `>${text.replace(/'/g, "&#x27;")}</button>`;
const actions = (signedIn: boolean | undefined): PlaceCheckActions => ({
  signedIn,
  confirm: async () => null,
  report: async () => null,
});

it("a confirmation goes stale after twelve months, and unset means not yet confirmed", () => {
  expect(checkState(undefined, NOW)).toBe("unconfirmed");
  expect(checkState(NOW, NOW)).toBe("confirmed");
  expect(checkState(NOW - STALE_AFTER_MS, NOW)).toBe("confirmed");
  expect(checkState(NOW - STALE_AFTER_MS - 1, NOW)).toBe("stale");
});

for (const locale of ["ja", "en"] as const) {
  const m = checkMessages[locale];
  const check = (props: Partial<Parameters<typeof PlaceCheck>[0]> = {}) =>
    render(<PlaceCheck locale={locale} now={NOW} {...props} />);

  it(`labels an open-data listing and shows where it came from (${locale})`, () => {
    const html = check({ osmRef: "node/42", actions: actions(false) });
    expect(html).toContain('data-check="unconfirmed"');
    expect(html).toMatch(/<details[^>]*class="[^"]*border-dashed/);
    expect(html).toContain(
      `<span class="min-w-0 flex-1">${badgeMessages[locale].unconfirmed}</span>`,
    );
    expect(html).toContain(m.fromOsm);
    expect(html).toContain(m.noOneYet);
    expect(html).toContain('href="https://www.openstreetmap.org/node/42"');
    expect(html).toContain(m.signInToCheck);
    expect(html).toContain(`href="/${locale}/sign-in"`);
    expect(html).not.toContain(button(m.stillHere));
  });

  it(`offers Still here and Something's wrong only to a signed-in member (${locale})`, () => {
    const member = check({ actions: actions(true) });
    expect(member).toContain(button(m.stillHere));
    expect(member).toContain(button(m.somethingWrong));
    expect(member).not.toContain(m.signInToCheck);
    expect(member).not.toContain(m.fromOsm);
    for (const loading of [check({ actions: actions(undefined) }), check()]) {
      expect(loading).not.toContain(button(m.stillHere));
      expect(loading).not.toContain(m.signInToCheck);
    }
  });

  it(`says when a person confirmed it, and says so when that was over a year ago (${locale})`, () => {
    const confirmed = check({ confirmedAt: NOW - 1000 });
    expect(confirmed).toContain('data-check="confirmed"');
    expect(confirmed).not.toContain("border-dashed");
    expect(confirmed).toContain(m.confirmed);
    expect(confirmed).toContain(locale === "en" ? "Oct 30, 2026" : "2026/10/30");
    const stale = check({ confirmedAt: NOW - STALE_AFTER_MS - DAY_MS });
    expect(stale).toContain('data-check="stale"');
    expect(stale).toContain(m.stale);
    expect(stale).toContain(locale === "en" ? "Oct 30, 2025" : "2025/10/30");
    for (const html of [confirmed, stale])
      expect(html).not.toMatch(/\b(?:rating|score|star|count)s?\b|評価|点数|件の確認/i);
  });

  it(`shows the panel on a real place's page but not on the fictional demo place (${locale})`, () => {
    const real = render(
      <PlaceView
        locale={locale}
        region={region}
        place={{ ...landmark, dataSources: [{ provider: "osm", ref: "way/7" }] }}
        page={null}
        sources={[]}
        checks={actions(true)}
      />,
    );
    expect(real).toContain('data-check="unconfirmed"');
    expect(real).toContain('href="https://www.openstreetmap.org/way/7"');
    expect(real.indexOf("data-check=")).toBeLessThan(real.indexOf('id="place-data-heading"'));
    const demo = render(
      <PlaceView locale={locale} region={region} place={place} page={null} sources={[]} />,
    );
    expect(demo).not.toContain("data-check=");
  });

  it(`marks unconfirmed real places in the list, never demo or confirmed ones (${locale})`, () => {
    const model = toHomeModel(
      [place, landmark, { ...landmark, _id: "checked", confirmedAt: NOW }],
      locale,
      region,
    );
    expect(model.items.map((item) => [item.id, item.unconfirmed])).toEqual([
      ["demo", false],
      ["landmark", true],
      ["checked", false],
    ]);
    const html = render(<PlaceList locale={locale} items={model.items} />);
    expect(html.match(/data-badge="unconfirmed"/g)).toHaveLength(1);
    expect(html.indexOf('data-badge="unconfirmed"')).toBeGreaterThan(
      html.indexOf('id="explore-place-landmark"'),
    );
  });

  it(`lists each open report for the steward with keep and hide (${locale})`, () => {
    const row = {
      id: "r1",
      slug: "inori",
      name: "祈りの丘絵本美術館",
      problem: "closed" as const,
      note: "Shutters down",
      reportedAt: NOW,
      reporterName: "Aki",
      isMock: false,
    };
    const html = render(
      <ReportsView
        locale={locale}
        rows={[row, { ...row, id: "r2", note: undefined, confirmedAt: NOW, isMock: true }]}
        onResolve={() => {}}
      />,
    );
    expect(html.match(/data-steward-card="report"/g)).toHaveLength(2);
    expect(html).toContain(`href="/${locale}/places/inori"`);
    expect(html).toContain(m.closed);
    expect(html).toContain("Shutters down");
    expect(html).toContain(badgeMessages[locale].unconfirmed);
    expect(html).toContain('data-badge="demo"');
    expect(html.split(button(m.keep))).toHaveLength(3);
    expect(html.split(button(m.hide))).toHaveLength(3);
    expect(html).toContain(`aria-current="page"`);
    expect(render(<ReportsView locale={locale} rows={[]} onResolve={() => {}} />)).toContain(
      m.reportsEmpty,
    );
  });
}
