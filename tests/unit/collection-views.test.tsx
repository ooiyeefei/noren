import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BadgeShelf } from "@/components/collection/badge-shelf";
import { BookView, type BookSetLike } from "@/components/collection/book-view";
import { Finished } from "@/components/collection/finished";
import {
  lastVisitedPin,
  NextPanelCard,
  type SetLike,
} from "@/components/collection/next-panel-card";
import { BadgeCloth } from "@/components/collection/noren";
import { SetView } from "@/components/collection/set-view";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { region } from "../fixtures/public-ui";

const center = { lat: 32.7415, lng: 129.8755 };
const names = { ja: "新地中華街", en: "Shinchi" };
const place = (index: number) => ({
  placeId: `place-${index}`,
  slug: `fictional-${index}`,
  names: [{ lang: "en", script: "latin" as const, value: `Fictional ${index}`, isPrimary: true }],
  pin: { lat: center.lat + (index + 1) * 0.001, lng: center.lng },
  line: index === 1 ? { en: "Try the toast.", ja: "トーストを。", postsRead: 3 } : null,
});
const set = (dyed: number[], over: Partial<SetLike> = {}): SetLike => ({
  neighbourhoodId: "shinchi",
  names,
  panelCount: 6,
  center,
  finished: dyed.length === 6,
  finishedOn: dyed.length === 6 ? "2026-11-05" : null,
  wholeArtUrl: dyed.length === 6 ? "https://art.test/whole.png" : null,
  lastVisitedPlaceId: dyed.length ? `place-${dyed.at(-1)}` : null,
  panels: [0, 1, 2, 3, 4, 5].map((index) => ({
    index,
    dyed: dyed.includes(index),
    artUrl: dyed.includes(index) ? `https://art.test/${index}.png` : null,
    places: [place(index)],
  })),
  ...over,
});
const tile = (dyed: number[]): BookSetLike => ({
  id: "set-1",
  neighbourhoodId: "shinchi",
  names,
  panelCount: 6,
  dyedCount: dyed.length,
  panels: set(dyed).panels,
});
const badge = {
  setId: "set-1",
  names,
  wholeArtUrl: "https://art.test/whole.png",
  finishedOn: "2026-11-05",
};
const book = (over: Partial<Parameters<typeof BookView>[0]> = {}) =>
  render(
    <BookView
      locale="en"
      region={region}
      sets={[tile([])]}
      badges={[]}
      panelsPerSet={6}
      signedIn={false}
      {...over}
    />,
  );
const textOf = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'");

describe("the book", () => {
  it("offers sign-in and shows no progress when signed out", () => {
    const html = book();
    expect(html).toContain("/en/sign-in");
    expect(textOf(html)).toContain("6 panels");
    expect(textOf(html)).not.toContain("0 of 6");
    expect(html).not.toContain("<img");
    expect(html).not.toContain(collectionMessages.en.badges);
    expect(html).not.toContain(collectionMessages.en.onlyYou);
  });

  it("offers nothing until sign-in has settled", () => {
    const html = book({ signedIn: undefined });
    expect(html).not.toContain("/en/sign-in");
    expect(html).not.toContain(collectionMessages.en.onlyYou);
  });

  it("shows a member their own progress, marked as private, with their badges", () => {
    const html = book({ signedIn: true, sets: [tile([0, 3])], badges: [badge] });
    expect(html).toContain("2 of 6");
    expect(html).toContain(collectionMessages.en.onlyYou);
    expect(html).toContain('href="/en/collection/shinchi"');
    expect(html).toContain("data-badge-set");
  });

  it("names the next panel once that set has loaded", () => {
    expect(book()).not.toContain("data-next-panel");
    const html = book({ signedIn: true, sets: [tile([0])], next: set([0]) });
    expect(html).toContain("Your next panel is 111 m away");
    expect(html).toContain('href="/en/places/fictional-1"');
  });

  it("says so when no neighbourhood has a noren", () => {
    expect(book({ sets: [] })).toContain(collectionMessages.en.empty);
  });

  it("has no points, ranks or leaderboards in either language", () => {
    for (const locale of ["ja", "en"] as const) {
      const html = book({ locale, signedIn: true, sets: [tile([1])], badges: [badge] });
      expect(textOf(html)).not.toMatch(/rank|score|points|leaderboard|順位|ランキング|ポイント/i);
    }
  });
});

describe("the badge shelf", () => {
  it("dates a badge in the zone it was earned, without a time", () => {
    const html = render(<BadgeShelf locale="en" badges={[badge]} panelCount={6} />);
    expect(html).toContain("Finished Nov 5, 2026");
    expect(html).toContain('alt="The finished noren of Shinchi"');
    expect(html).not.toMatch(/\d:\d\d/);
  });

  it("tells an empty shelf how to fill it", () => {
    const html = render(<BadgeShelf locale="en" badges={[]} panelCount={6} />);
    expect(html).toContain(collectionMessages.en.noBadges);
  });

  it("still draws a badge whose picture has gone", () => {
    const html = render(<BadgeCloth locale="en" name="Shinchi" artUrl={null} panelCount={6} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("完");
  });
});

describe("the set page", () => {
  const view = (value: SetLike, signedIn: boolean | undefined = true) =>
    render(<SetView locale="en" region={region} set={value} signedIn={signedIn} />);

  it("links every panel's place and shows art only for what is dyed", () => {
    const html = view(set([2]));
    expect(html).toContain("1 of 6");
    expect(html.match(/<img/g)).toHaveLength(1);
    for (const index of [0, 1, 2, 3, 4, 5])
      expect(html).toContain(`href="/en/places/fictional-${index}"`);
    expect(html.match(new RegExp(collectionMessages.en.panelDyed, "g"))).toHaveLength(1);
  });

  it("points to the next panel until the set is finished, then to the picture", () => {
    expect(view(set([0]))).toContain("data-next-panel");
    const finished = view(set([0, 1, 2, 3, 4, 5]));
    expect(finished).not.toContain("data-next-panel");
    expect(finished).toContain("data-finished");
    expect(finished).toContain("Shinchi&#x27;s noren is yours");
  });

  it("asks a signed-out visitor to sign in, and tells them nothing is theirs yet", () => {
    const html = view(set([]), false);
    expect(html).toContain("/en/sign-in");
    expect(html).toContain("0 of 6");
    expect(html).not.toContain(collectionMessages.en.onlyYou);
  });

  it("says when a panel has no place to read while a steward swaps one", () => {
    const value = set([]);
    const panels = value.panels.map((panel) =>
      panel.index === 0 ? { ...panel, places: [] } : panel,
    );
    expect(textOf(view({ ...value, panels }))).toContain(collectionMessages.en.placesWaiting);
  });
});

describe("the next panel", () => {
  const card = (value: SetLike, from?: { lat: number; lng: number }) =>
    render(<NextPanelCard locale="en" region={region} set={value} from={from} />);

  it("starts from the neighbourhood's middle before any visit", () => {
    const html = card(set([]));
    expect(html).toContain(collectionMessages.en.nextStart);
    expect(html).toContain("from the middle of Shinchi");
    expect(html).toContain('href="/en/places/fictional-0"');
  });

  it("measures from the last place visited, naming the distance and its line", () => {
    const html = card(set([0]));
    expect(html).toContain("Your next panel is 111 m away");
    expect(html).toContain('href="/en/places/fictional-1"');
    expect(html).toContain("Try the toast.");
    expect(html).toContain("Stitched by Noren&#x27;s AI from 3 posts.");
  });

  it("uses the place just checked in at when told to", () => {
    expect(card(set([0, 5]), set([]).panels[5]!.places[0]!.pin!)).toContain(
      'href="/en/places/fictional-4"',
    );
  });

  it("measures from the middle when the last place has left the set, without saying start", () => {
    const value = set([0], { lastVisitedPlaceId: "gone" });
    expect(lastVisitedPin(value)).toBeNull();
    const html = card(value);
    expect(html).toContain(collectionMessages.en.nextPanelTitle);
    expect(html).not.toContain(collectionMessages.en.nextStart);
    expect(html).toContain("from the middle of Shinchi");
  });

  it("offers every place on the panel, since either one fills it", () => {
    const value = set([0]);
    const panels = value.panels.map((panel) =>
      panel.index === 1 ? { ...panel, places: [place(1), place(7)] } : panel,
    );
    const html = card({ ...value, panels });
    expect(html).toContain('href="/en/places/fictional-1"');
    expect(html).toContain("data-next-panel-others");
    expect(html).toContain('href="/en/places/fictional-7"');
    expect(card(value)).not.toContain("data-next-panel-others");
  });

  it("shows nothing when every panel is dyed", () => {
    expect(card(set([0, 1, 2, 3, 4, 5]))).toBe("");
  });
});

describe("the finished picture", () => {
  it("offers the plain picture until a share is ready, with no progress numbers", () => {
    const html = render(
      <Finished
        locale="en"
        name="Shinchi"
        fileName="noren-shinchi.png"
        wholeArtUrl="https://art.test/whole.png"
        finishedOn="2026-11-05"
      />,
    );
    expect(html).toContain('href="https://art.test/whole.png"');
    expect(html).toContain(collectionMessages.en.openWhole);
    expect(html).toContain("Finished Nov 5, 2026");
    expect(textOf(html.replace(/<time[\s\S]*?<\/time>/g, ""))).not.toMatch(/\d/);
  });
});
