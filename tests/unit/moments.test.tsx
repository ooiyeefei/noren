import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbedView, type EmbedSourceView } from "@/components/embeds/embed-view";
import { loadEmbedScript } from "@/components/embeds/embed-scripts";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import { StoryFeed, type StoryFeedActions } from "@/components/place/story-feed";
import {
  toStoryFeed,
  type SourceViewLike,
  type StoryFeedEntry,
  type WrittenStoryLike,
} from "@/components/public/mapping";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";
import { region } from "../fixtures/public-ui";

// The views run without a DOM; this harness keeps their state and effects between calls.
const hooks = vi.hoisted(() => ({
  current: undefined as
    | { values: unknown[]; cursor: number; effects: (() => unknown)[] }
    | undefined,
}));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useState: (initial: unknown) => {
      const state = hooks.current;
      if (!state) return react.useState(initial);
      const index = state.cursor++;
      if (!(index in state.values))
        state.values[index] = typeof initial === "function" ? initial() : initial;
      return [
        state.values[index],
        (value: unknown) => {
          state.values[index] = typeof value === "function" ? value(state.values[index]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const state = hooks.current;
      if (!state) return react.useRef(initial);
      const index = state.cursor++;
      if (!(index in state.values)) state.values[index] = { current: initial };
      return state.values[index];
    },
    useEffect: (effect: () => void, deps: unknown[]) => {
      const state = hooks.current;
      if (!state) return react.useEffect(effect, deps);
      state.effects.push(effect);
    },
    useId: () => (hooks.current ? "moments" : react.useId()),
  };
});
vi.mock("@/components/drafts/drafts", async () => {
  const { useState } = await import("react");
  return {
    useDraft: <T,>(_name: unknown, empty: T) => useState(empty),
    usePhotoDrafts: () => null,
  };
});
vi.mock("@/components/embeds/embed-scripts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/embeds/embed-scripts")>()),
  loadEmbedScript: vi.fn(async () => {}),
}));
beforeEach(() => {
  vi.mocked(loadEmbedScript).mockClear();
});
afterEach(() => {
  hooks.current = undefined;
});

const day = (n: number) => Date.UTC(2026, 9, n);
const moment = (id: string, authorKey: string | undefined, added: number, name = "Mika") =>
  ({
    _id: id,
    body: `Moment ${id}`,
    lang: "en",
    authorName: name,
    authorKey,
    addedAt: day(added),
    isMock: false,
    canRemove: false,
  }) satisfies WrittenStoryLike;
const post = (fields: Partial<SourceViewLike> = {}): SourceViewLike => ({
  _id: "post",
  platform: "youtube",
  canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  embed: { kind: "iframe", url: "https://www.youtube-nocookie.com/embed/abcdefghijk" },
  authorHandle: "Fictional channel",
  creatorNote: "The tram stop story, on video.",
  noteLang: "en",
  isMock: false,
  sharedBy: "Fictional sharer",
  addedAt: day(4),
  addedByMe: false,
  ...fields,
});
const cards = (feed: readonly StoryFeedEntry[]) =>
  feed.flatMap((entry) => (entry.kind === "written" ? [entry] : []));
const ids = (entry: StoryFeedEntry) =>
  entry.kind === "written" ? entry.moments.map((story) => story._id) : [entry.id];

describe("one card per person", () => {
  it("puts one person's moments on one card, oldest first", () => {
    const [card, ...rest] = toStoryFeed(
      [],
      [moment("c", "a", 3), moment("b", "a", 2), moment("a", "a", 1)],
      false,
    );
    expect(rest).toEqual([]);
    expect(card).toMatchObject({ kind: "written", authorName: "Mika", addedAt: day(3) });
    expect(ids(card!)).toEqual(["a", "b", "c"]);
  });

  it("orders cards by each person's newest moment, however old their first one is", () => {
    const feed = toStoryFeed(
      [],
      [
        moment("mika-3", "mika", 9),
        moment("ren-1", "ren", 8, "Ren"),
        moment("sora-1", "sora", 7, "Sora"),
        moment("mika-1", "mika", 1),
      ],
      false,
    );
    expect(feed.map(ids)).toEqual([["mika-1", "mika-3"], ["ren-1"], ["sora-1"]]);
  });

  it("orders a card among the posts by its newest moment too", () => {
    const feed = toStoryFeed(
      [post({ _id: "middle", addedAt: day(5) })],
      [moment("new", "a", 6), moment("old", "a", 1), moment("older-card", "b", 4, "Ren")],
      false,
    );
    expect(feed.map((entry) => entry.id)).toEqual(["a", "middle", "b"]);
  });

  it("keeps two people with one name apart", () => {
    const feed = toStoryFeed([], [moment("x", "a", 2), moment("y", "b", 1)], false);
    expect(feed.map(ids)).toEqual([["x"], ["y"]]);
  });

  it("reads on from what is left when a moment is removed", () => {
    const before = [moment("c", "a", 3), moment("b", "a", 2), moment("a", "a", 1)];
    // The server drops a removed story and moves the key to the writer's next one.
    const after = before.slice(0, 2).map((story) => ({ ...story, authorKey: "b" }));
    expect(toStoryFeed([], after, false).map(ids)).toEqual([["b", "c"]]);
    expect(toStoryFeed([], [], false)).toEqual([]);
  });

  it("lets a story from a server with no key stand alone", () => {
    const feed = toStoryFeed([], [moment("x", undefined, 2), moment("y", undefined, 1)], false);
    expect(feed.map(ids)).toEqual([["x"], ["y"]]);
  });

  it("uses the opaque key for the card, so no person's id is needed on the page", () => {
    const [card] = toStoryFeed([], [moment("x", "story-id", 1)], false);
    expect(card?.id).toBe("story-id");
    expect(Object.keys(card!).sort()).toEqual(["addedAt", "authorName", "id", "kind", "moments"]);
  });

  it("keeps a member's linked post as its own row, and found posts after every member", () => {
    const feed = toStoryFeed(
      [
        post({ _id: "linked", addedAt: day(2), addedByMe: true }),
        post({ _id: "found", foundInPublicPost: true, foundKind: "story", postedAt: day(20) }),
      ],
      [moment("mine", "a", 1), moment("mine-2", "a", 3)],
      false,
    );
    expect(feed.map((entry) => `${entry.kind}:${entry.id}`)).toEqual([
      "written:a",
      "post:linked",
      "post:found",
    ]);
    expect(cards(feed)[0]?.moments).toHaveLength(2);
  });
});

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)];
}

describe("a person's card on the page", () => {
  const ui = placePageMessages.en;
  const three = [
    moment("third", "a", 3),
    { ...moment("second", "a", 2), canRemove: true },
    moment("first", "a", 1),
  ];
  const feedHtml = (stories: WrittenStoryLike[], actions?: StoryFeedActions, locale = "en") =>
    render(
      <StoryFeed
        locale={locale as "en"}
        entries={toStoryFeed([], stories, false)}
        scriptOrigins={[]}
        frameOrigins={[]}
        actions={actions}
      />,
    );

  it("shows the name once, then each moment with its date, oldest first", () => {
    const html = feedHtml(three);
    expect(html.split("By Mika")).toHaveLength(2);
    expect(html.indexOf("By Mika")).toBeLessThan(html.indexOf("Moment first"));
    expect(html.indexOf("Moment first")).toBeLessThan(html.indexOf("Moment second"));
    expect(html.indexOf("Moment second")).toBeLessThan(html.indexOf("Moment third"));
    for (const date of ["Oct 1, 2026", "Oct 2, 2026", "Oct 3, 2026"]) expect(html).toContain(date);
  });

  it("keeps each moment in its own language, and the rest in the page's", () => {
    const html = feedHtml([{ ...moment("ja", "a", 1), lang: "ja", body: "猫がいました。" }]);
    expect(html).toMatch(/<p lang="ja"[^>]*>猫がいました。<\/p>/);
    expect(html).not.toMatch(/<article[^>]*lang="ja"/);
  });

  it("gives each moment its own photos", () => {
    const photo = (key: string) => ({
      _id: key,
      key,
      width: 800,
      height: 600,
      waiting: false,
      canRemove: false,
    });
    const html = render(
      <StoryFeed
        locale="en"
        entries={toStoryFeed(
          [],
          [
            { ...moment("two", "a", 2), photos: [photo("photos/two.jpg")] },
            { ...moment("one", "a", 1), photos: [photo("photos/one.jpg")] },
          ],
          false,
        )}
        scriptOrigins={[]}
        frameOrigins={[]}
        photoBaseUrl="https://photos.test"
      />,
    );
    const at = (text: string) => html.indexOf(text);
    expect(at("Moment one")).toBeLessThan(at("photos/one.jpg"));
    expect(at("photos/one.jpg")).toBeLessThan(at("Moment two"));
    expect(at("Moment two")).toBeLessThan(at("photos/two.jpg"));
  });

  it("marks a demo moment, and only that moment", () => {
    const html = feedHtml([{ ...moment("demo", "a", 2), isMock: true }, moment("real", "a", 1)]);
    const demo = badgeMessages.en.demo;
    expect(html.split(`>${demo}<`)).toHaveLength(2);
    expect(html.indexOf("Moment real")).toBeLessThan(html.indexOf(`>${demo}<`));
  });

  it("offers Remove per moment and sends only that moment's id", async () => {
    const remove = vi.fn(async () => null);
    const state = { values: [] as unknown[], cursor: 0, effects: [] };
    const draw = () => {
      state.cursor = 0;
      hooks.current = state;
      try {
        return StoryFeed({
          locale: "en",
          entries: toStoryFeed([], three, false),
          scriptOrigins: [],
          frameOrigins: [],
          actions: { remove },
        });
      } finally {
        hooks.current = undefined;
      }
    };
    const click = (text: string) => {
      const button = elements(draw()).find((item) => item.props.children === text);
      (button!.props.onClick as () => void)();
    };
    expect(elements(draw()).filter((item) => item.props.children === ui.remove)).toHaveLength(1);
    click(ui.remove);
    click(ui.removeYes);
    await vi.waitFor(() => expect(remove).toHaveBeenCalled());
    expect(remove).toHaveBeenCalledWith({ kind: "written", id: "second" });
  });

  it("counts nothing", () => {
    const words = feedHtml(three).replace(/<[^>]*>/g, " ");
    // Only the three dates hold numbers, so no visit or moment total reaches the page.
    expect(words.replace(/Oct \d+, 2026/g, "")).not.toMatch(/\d/);
  });
});

const instagram: EmbedSourceView = {
  id: "ig",
  platform: "instagram",
  canonicalUrl: "https://www.instagram.com/p/mock/",
  embed: {
    kind: "blockquote",
    url: "https://www.instagram.com/p/mock/",
    scriptUrl: "https://www.instagram.com/embed.js",
  },
  authorHandle: "@mock_creator",
  authorUrl: "https://www.instagram.com/mock_creator/",
  postedAt: day(29),
  creatorNote: "A fictional line about the lanterns.",
  noteLang: "en",
  isMock: false,
};
const youtube: EmbedSourceView = {
  ...instagram,
  id: "yt",
  platform: "youtube",
  canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  embed: { kind: "iframe", url: "https://www.youtube-nocookie.com/embed/abcdefghijk" },
};

/** Runs a post the way React would, with kept state, so its button can be pressed. */
function row(source: EmbedSourceView, locale: "en" | "ja" = "en") {
  const state = { values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[] };
  const draw = () => {
    state.cursor = 0;
    state.effects = [];
    hooks.current = state;
    try {
      const element = EmbedView({
        locale,
        source,
        scriptOrigins: ["https://www.instagram.com"],
        frameOrigins: ["https://www.youtube-nocookie.com"],
        children: <footer>Shared by Fictional sharer</footer>,
      }) as ReactElement<Record<string, never>, (props: unknown) => ReactNode>;
      return element.type(element.props);
    } finally {
      hooks.current = undefined;
    }
  };
  return {
    html: () => render(<>{draw()}</>),
    settle: () => state.effects.forEach((effect) => effect()),
    press() {
      const button = elements(draw()).find((item) => item.type === "button");
      (button!.props.onClick as () => void)();
    },
    buttons: () => elements(draw()).filter((item) => item.type === "button"),
  };
}

describe("a post from a platform, shown on tap", () => {
  const m = placeUiMessages.en;

  it.each([
    ["Instagram", instagram],
    ["YouTube", youtube],
    ["Facebook", { ...youtube, platform: "facebook" }],
    ["TikTok", { ...youtube, platform: "tiktok" }],
    ["X", { ...instagram, platform: "x" }],
  ] satisfies [string, EmbedSourceView][])(
    "%s starts as a row with who posted it, the date, the line and a button, and loads nothing",
    (name, source) => {
      const view = row(source);
      const html = view.html();
      view.settle();
      expect(html).toContain(`>${name}<`);
      expect(html).toContain("@mock_creator");
      expect(html).toContain("Oct 29, 2026");
      expect(html).toContain("A fictional line about the lanterns.");
      expect(html).toContain(`>${m.showPost}</button>`);
      expect(html).toContain(`aria-label="Show post from ${name}"`);
      expect(html).not.toMatch(/<script|<iframe|<blockquote/);
      expect(loadEmbedScript).not.toHaveBeenCalled();
    },
  );

  it("keeps the credit, the link back and what loading does, closed and open", () => {
    const view = row(youtube);
    const check = (html: string) => {
      expect(html).toContain(`href="${youtube.authorUrl}"`);
      expect(html).toContain(`href="${youtube.canonicalUrl}"`);
      expect(html).toContain(m.viewOriginal);
      expect(html).toContain("Shared by Fictional sharer");
    };
    const closed = view.html();
    check(closed);
    expect(closed).toContain("may set cookies");
    expect(closed).toContain('href="/en/notice"');
    view.press();
    check(view.html());
  });

  it("loads a framed post in place when pressed", () => {
    const view = row(youtube);
    view.press();
    const html = view.html();
    expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk"');
    expect(view.buttons()).toEqual([]);
    expect(html.indexOf("A fictional line")).toBeLessThan(html.indexOf("<iframe"));
    expect(html.indexOf("<iframe")).toBeLessThan(html.indexOf(m.viewOriginal));
  });

  it("fetches a platform's script only after the press", () => {
    const view = row(instagram);
    view.html();
    view.settle();
    expect(loadEmbedScript).not.toHaveBeenCalled();
    view.press();
    expect(view.html()).toContain('class="instagram-media"');
    view.settle();
    expect(loadEmbedScript).toHaveBeenCalledTimes(1);
    expect(loadEmbedScript).toHaveBeenCalledWith("https://www.instagram.com/embed.js", [
      "https://www.instagram.com",
    ]);
  });

  it("refuses a frame from a host the region does not allow", () => {
    const view = row({
      ...youtube,
      embed: { kind: "iframe", url: "https://elsewhere.example/embed" },
    });
    view.press();
    const html = view.html();
    expect(html).not.toContain("<iframe");
    expect(html).toContain(m.loadFailed);
    expect(html).toContain(m.viewOriginal);
  });

  it("a plain link card has nothing to load, so it has no button", () => {
    const html = row({
      ...youtube,
      platform: "web",
      embed: { kind: "link", url: "https://example.com/mock" },
      title: "A fictional walk",
    }).html();
    expect(html).not.toContain("<button");
    expect(html).toContain(`>${m.webPage}<`);
    expect(html).toContain("A fictional walk");
    expect(html).toContain(m.viewOriginal);
  });

  it("says it in Japanese too", () => {
    const html = row(instagram, "ja").html();
    expect(html).toContain(`>${placeUiMessages.ja.showPost}</button>`);
    expect(html).toContain('aria-label="Instagramの投稿を表示"');
  });

  it("shows the date a member shared a post when the post has no date of its own", () => {
    const feed = (fields: Partial<SourceViewLike>) =>
      render(
        <StoryFeed
          locale="en"
          entries={toStoryFeed([post(fields)], [], false)}
          scriptOrigins={[]}
          frameOrigins={["https://www.youtube-nocookie.com"]}
        />,
      );
    expect(feed({})).toContain("Oct 4, 2026");
    const dated = feed({ postedAt: day(1) });
    expect(dated).toContain("Posted on Oct 1, 2026");
    expect(dated).not.toContain("Oct 4, 2026");
  });

  it("gives no date for a found post without one, because when it was linked means nothing", () => {
    const html = render(
      <StoryFeed
        locale="en"
        entries={toStoryFeed(
          [post({ foundInPublicPost: true, foundKind: "story", sharedBy: undefined })],
          [],
          false,
        )}
        scriptOrigins={[]}
        frameOrigins={[]}
      />,
    );
    expect(html).not.toContain("Oct 4, 2026");
  });
});

describe("asking someone who already shared a story here", () => {
  const actions = (fields: Partial<AddStoryActions> = {}): AddStoryActions => ({
    signedIn: true,
    add: async () => null,
    write: async () => null,
    ...fields,
  });
  const prompted = (locale: "en" | "ja", sharedHere?: boolean) => {
    hooks.current = { values: [], cursor: 0, effects: [] };
    try {
      return render(
        <>
          {AddStory({
            locale,
            region,
            actions: actions({ sharedHere }),
          })}
        </>,
      );
    } finally {
      hooks.current = undefined;
    }
  };

  it.each(["en", "ja"] as const)("%s: asks for another moment", (locale) => {
    const m = addStoryMessages[locale];
    expect(prompted(locale, true)).toContain(m.promptAgain);
    expect(prompted(locale, true)).not.toContain(m.prompt);
  });

  it.each(["en", "ja"] as const)("%s: asks anyone else for their story", (locale) => {
    const m = addStoryMessages[locale];
    for (const sharedHere of [false, undefined]) {
      expect(prompted(locale, sharedHere)).toContain(m.prompt);
      expect(prompted(locale, sharedHere)).not.toContain(m.promptAgain);
    }
  });

  it("uses the words the brief asks for", () => {
    expect(addStoryMessages.en.promptAgain).toContain("Add another moment");
  });
});
