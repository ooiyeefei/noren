import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";
import { FactList, factDate, type FactLike } from "@/components/facts/fact-list";
import { FactTickList, type FactTickActions } from "@/components/facts/fact-tick-list";
import { PlaceView, type PlaceFacts } from "@/components/public/place-view";
import { factMessages } from "@/lib/i18n/messages/facts";
import { page, place, region, sources } from "../fixtures/public-ui";

const vocabulary = [
  {
    key: "steps_at_door",
    labels: { en: "Steps at the door", ja: "入口に段差" },
    labelsReviewedBy: null,
  },
  {
    key: "prayer_room",
    labels: { en: "A prayer room (surau)", ja: "礼拝室あり" },
    labelsReviewedBy: "someone",
  },
];
const member = (over: Partial<FactLike> = {}): FactLike =>
  ({
    _id: "f1",
    key: "steps_at_door",
    value: "yes",
    day: "2026-11-03",
    isOld: false,
    basis: "member",
    reporterName: "Aiko",
    addedByMe: false,
    ...over,
  }) as FactLike;
const tick = (over: Partial<FactTickActions> = {}): FactTickActions => ({
  signedIn: true,
  mine: {},
  report: async () => null,
  remove: async () => null,
  ...over,
});

for (const locale of ["en", "ja"] as const) {
  const m = factMessages[locale];
  const list = (facts: FactLike[], hide?: () => Promise<unknown>) =>
    render(
      <FactList
        locale={locale}
        vocabulary={vocabulary}
        facts={facts}
        maxAgeDays={365}
        placeSlug="demo-cafe"
        hide={hide}
      />,
    );

  it(`shows who reported a fact and the day, with no count or verdict (${locale})`, () => {
    const html = list([member(), member({ _id: "f2", reporterName: "Ben", day: "2026-10-01" })]);
    expect(html).toContain("Aiko");
    expect(html).toContain(factDate("2026-11-03", locale));
    expect(html).toContain("Ben");
    expect(html).not.toMatch(/\b\d+ (?:people|reports?)\b|\d+人|\d+件/);
    expect(html).not.toMatch(/✓|✔|text-(?:green|red)|bg-(?:green|red)/);
    expect(html).not.toMatch(/\b(?:rating|score|star|sentiment)s?\b/i);
    for (const id of ["f1", "f2"])
      expect(html).toContain(
        `href="/${locale}/takedown?page=%2F${locale}%2Fplaces%2Fdemo-cafe&amp;factId=${id}"`,
      );
    expect(html).not.toContain(m.hide + "<");
  });
  it(`shows disagreeing records side by side with dates and no winner (${locale})`, () => {
    const html = list([
      member({ value: "yes", day: "2026-11-03" }),
      member({ _id: "f2", value: "no", day: "2026-08-01", reporterName: "Ben" }),
    ]);
    expect(html).toContain(m.differ);
    expect(html.match(/data-fact=""/g)).toHaveLength(2);
    expect(html).toContain(factDate("2026-08-01", locale));
    // Newest first, whatever the answer was.
    expect(html.indexOf("Aiko")).toBeLessThan(html.indexOf("Ben"));
    expect(list([member()])).not.toContain(m.differ);
  });
  it(`marks an old record, and shows a visitor's words with their post (${locale})`, () => {
    expect(list([member({ isOld: true })])).toContain("data-old");
    expect(list([member()])).not.toContain("data-old");
    const html = list([
      {
        _id: "p1",
        key: "prayer_room",
        value: "yes",
        day: "2026-11-03",
        isOld: false,
        basis: "post",
        quote: "There is a surau at the back.",
        source: { url: "https://example.com/post/1", platform: "instagram" },
      },
    ]);
    expect(html).toContain("There is a surau at the back.");
    expect(html).toContain('href="https://example.com/post/1"');
    expect(html).not.toContain("Aiko");
  });
  it(`marks unreviewed labels only, and gives a steward Hide (${locale})`, () => {
    const html = list([member(), member({ _id: "f3", key: "prayer_room" })], async () => null);
    expect(html.match(/data-badge="unreviewed"/g)).toHaveLength(1);
    expect(html.match(new RegExp(`>${m.hide}</button>`, "g"))).toHaveLength(2);
  });

  it(`the tick list starts with neither yes nor no chosen and keeps a member's answer (${locale})`, () => {
    const html = render(
      <FactTickList locale={locale} vocabulary={vocabulary} actions={tick()} />,
    );
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('disabled=""');
    const mine = render(
      <FactTickList
        locale={locale}
        vocabulary={vocabulary}
        actions={tick({ mine: { prayer_room: { factId: "f9", value: "no" } } })}
      />,
    );
    expect(mine.match(/checked=""/g)).toHaveLength(1);
    expect(mine).toContain(m.tickClear);
  });
  it(`asks for the clear yes before a first report, and holds the answers until then (${locale})`, () => {
    const html = render(
      <FactTickList
        locale={locale}
        vocabulary={vocabulary}
        actions={tick({
          shownAs: { displayName: "Aiko", confirm: async () => null, save: async () => null },
        })}
      />,
    );
    expect(html).toContain(m.askYes);
    expect(html).toContain("data-shown-as");
    expect(html.match(/<fieldset[^>]*disabled/g)).toHaveLength(2);
  });
  it(`points a signed-out reader to sign in (${locale})`, () => {
    const html = render(
      <FactTickList locale={locale} vocabulary={vocabulary} actions={tick({ signedIn: false })} />,
    );
    expect(html).toContain(`href="/${locale}/sign-in"`);
    expect(html).not.toContain('type="radio"');
  });

  const view = (facts?: PlaceFacts) =>
    render(
      <PlaceView
        locale={locale}
        region={region}
        place={{ ...place, isMock: false }}
        page={page}
        sources={sources}
        stories={[]}
        facts={facts}
      />,
    );
  const section = (over: Partial<PlaceFacts> = {}): PlaceFacts => ({
    vocabulary,
    facts: [member()],
    ...over,
  });
  it(`has no section unless it is given a fact list, so the page is unchanged (${locale})`, () => {
    const without = view();
    expect(without).not.toContain("facts-heading");
    expect(without).not.toContain(m.heading);
    expect(view(section({ vocabulary: [] }))).toBe(without);
    // The shipped region file has the switch off and no fact list, so the container passes nothing.
    expect(region).not.toHaveProperty("facts");
  });
  it(`puts the section before the stories, with its own heading (${locale})`, () => {
    const html = view(section({ tick: tick() }));
    expect(html).toContain('aria-labelledby="facts-heading"');
    expect(html.match(/<h2 id="facts-heading"/g)).toHaveLength(1);
    expect(html.indexOf('id="facts-heading"')).toBeLessThan(html.indexOf('id="stories-heading"'));
    expect(html).toContain(m.tellUs);
    expect(view(section())).not.toContain(m.tellUs);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(view(section({ facts: undefined }))).toContain('role="status"');
    expect(view(section({ facts: [] }))).toContain(m.empty);
  });
}

it("dates a plain day without a time zone moving it", () => {
  expect(factDate("2026-11-03", "en")).toBe("November 3, 2026");
  expect(factDate("nonsense", "en")).toBe("nonsense");
});
