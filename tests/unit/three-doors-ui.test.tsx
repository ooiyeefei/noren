import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AddStory, type AddStoryActions } from "@/components/place/add-story";
import { toWrittenArgs, type StoryDraft } from "@/components/place/add-story-form";
import { CarriedHere } from "@/components/place/carried-here";
import { CarryPicker } from "@/components/place/carry-picker";
import { StoryFeed } from "@/components/place/story-feed";
import { publicRegionProps, toStoryFeed, type WrittenStoryLike } from "@/components/public/mapping";
import { SlipCard } from "@/components/walk/omikuji-panel";
import { ThreadTiedMark } from "@/components/walk/thread-knot";
import type { Locale } from "@/lib/i18n";
import { walkMessages } from "@/lib/i18n/messages/walk";
import type { Slip, ThreadStop } from "@/lib/walk/types";
import { config } from "../fixtures/public-ui";
import { ORIGIN, northOf } from "../fixtures/walk";

// "Three doors": the further doors of a slip, a question carried to another place, and the form.

vi.mock("@/components/voice/voice-input", () => ({ VoiceInput: () => null }));
vi.mock("@/components/drafts/drafts", () => ({
  // A form already open on the written story, with a question typed in.
  useDraft: <T,>(name: string | null | undefined, empty: T): [T, () => void] => [
    name?.endsWith(":mode")
      ? ("write" as T)
      : name?.endsWith(":text")
        ? ({ ...empty, question: "Who paints the sign?" } as T)
        : empty,
    () => undefined,
  ],
  usePhotoDrafts: () => null,
}));

const withSwitches = (features: Partial<(typeof config)["features"]>) => ({
  ...config,
  features: { ...config.features, ...features },
});
const on = (locale: Locale) =>
  publicRegionProps(withSwitches({ walk: true, thread: true }), locale);
const off = (locale: Locale) =>
  publicRegionProps(withSwitches({ walk: true, thread: false }), locale);

const names = (en: string, ja: string) => [
  { lang: "en", script: "latin" as const, value: en, isPrimary: true },
  { lang: "ja", script: "kanji" as const, value: ja, isPrimary: true },
];
const placeAt = (slug: string, en: string, ja: string, metresNorth: number) => ({
  slug,
  names: names(en, ja),
  category: "cafe",
  confirmedAt: 5,
  hasStory: true,
  pin: northOf(ORIGIN, metresNorth),
});
const starter = { kind: "starter" as const, key: "oldest" };
const second: ThreadStop = {
  via: "draw",
  place: placeAt("candle-shop", "Candle Workshop", "ろうそく工房", 200),
  question: {
    kind: "story",
    storyId: "k17second00001",
    text: "Who lights them?",
    lang: "en",
    askedBy: "Mika",
  },
};
const third: ThreadStop = {
  via: "carried",
  carried: {
    askedBy: "Kenji",
    from: { slug: "candle-shop", names: names("Candle Workshop", "ろうそく工房") },
  },
  place: placeAt("tea-house", "Tea House", "茶屋", 380),
  question: starter,
};
const slip: Slip = {
  place: placeAt("lane-cafe", "Lane Cafe", "路地の店", 0),
  question: starter,
  thread: [second, third],
};

const door = (
  opened: boolean,
  position: null | { lat: number; lng: number; accuracy: number } = null,
) => ({
  opened,
  onOpen: vi.fn(),
  position,
  accuracyAllowanceMetres: 30,
  locate: vi.fn(),
});
const card = (
  locale: Locale,
  over: {
    slip?: Slip;
    first?: boolean;
    doors?: number | null;
    from?: typeof ORIGIN | null;
    region?: ReturnType<typeof on>;
  } = {},
) =>
  render(
    <SlipCard
      locale={locale}
      region={over.region ?? on(locale)}
      m={walkMessages[locale]}
      write="Write a story"
      planner={false}
      slip={over.slip ?? slip}
      heading="Today's slip"
      from={over.from === undefined ? null : over.from}
      centre={undefined}
      door={door(over.first ?? true)}
      dayText={undefined}
      {...(over.doors === null
        ? {}
        : { thread: { doors: over.doors ?? 0, onOpenDoor: vi.fn(), tiedOn: "Nov 10, 2026" } })}
    />,
  );

describe("the further doors of a slip", () => {
  it("show only after the slip's own seal is open", () => {
    const sealed = card("en", { first: false });
    expect(sealed).toContain("data-slip-sealed");
    expect(sealed).not.toContain("data-slip-thread");
    expect(sealed).not.toContain("Three doors");
    expect(card("en", { first: true })).toContain("data-slip-thread");
  });

  it("show nothing when the slip has no thread, or the page has no thread switch", () => {
    expect(card("en", { slip: { ...slip, thread: undefined } as Slip })).not.toContain(
      "data-slip-thread",
    );
    expect(card("en", { doors: null })).not.toContain("data-slip-thread");
  });

  it("show door two sealed, and door three as one line until door two is open", () => {
    const html = card("en", { doors: 0 });
    expect(html).toContain("Three doors");
    expect(html).toContain(
      "Two more doors make a thread. The next one stays sealed until you are there.",
    );
    expect(html).toContain("Second door");
    expect(html).toContain("Candle Workshop");
    expect(html).toContain('href="/en/places/candle-shop"');
    expect(html).toContain("A random pick nearby. It is not a ranking.");
    expect(html).toContain('data-thread-door="2"');
    expect(html).toContain("I&#x27;m at the door");
    expect(html).toContain("Open without location");
    expect(html).not.toContain("Who lights them?");
    expect(html).toContain("The third door shows once the second is open.");
    expect(html).not.toContain('data-thread-door="3"');
    expect(html).not.toContain("Third door");
    expect(html).not.toContain("Tea House");
    expect(html).not.toContain("data-thread-tied");
  });

  it("open door two with the question and the write link, then show door three sealed", () => {
    const html = card("en", { doors: 1 });
    expect(html).toContain("Who lights them?");
    expect(html).toMatch(/lang="en"[^>]*>Who lights them\?/);
    expect(html).toContain("Mika asked:");
    expect(html).toContain(
      'href="/en/places/candle-shop?tab=stories&amp;write=1&amp;answers=story:k17second00001"',
    );
    expect(html).toContain("Write what you heard");
    expect(html).not.toContain("The third door shows once");
    expect(html).toContain('data-thread-door="3"');
    expect(html).toContain("Third door");
    expect(html).toContain("Tea House");
    expect(html).toContain("Kenji&#x27;s question from Candle Workshop leads here.");
    expect(html).toContain("data-slip-open-without");
    expect(html).not.toContain("data-thread-tied");
  });

  it("say the thread is tied, with the date, once the third seal is open", () => {
    const html = card("en", { doors: 2 });
    expect(html).toContain("Three doors, one thread. Tied on Nov 10, 2026.");
    expect(html).toContain("answers=starter:oldest");
    expect(html).not.toContain("data-slip-sealed");
  });

  it("show the distance from where the phone is, or from the door before when there is no reading", () => {
    const here = card("en", { doors: 0, from: ORIGIN });
    expect(here).toMatch(/data-thread-leg[^>]*>About [\d,]+ m, \d+ min on foot, to the north\./);
    const nowhere = card("en", { doors: 1, from: null });
    expect(nowhere).toMatch(
      /data-thread-leg[^>]*>About [\d,]+ m, \d+ min on foot, to the north, from Lane Cafe\./,
    );
    expect(nowhere).toMatch(
      /data-thread-leg[^>]*>About [\d,]+ m, \d+ min on foot, to the north, from Candle Workshop\./,
    );
    expect(card("ja", { doors: 0, from: null })).toMatch(
      /data-thread-leg[^>]*>路地の店から、約[\d,]+ m、徒歩およそ\d+分、北の方向です。/,
    );
  });

  it("say where a carried question came from on the opened seal", () => {
    const carried: Slip = {
      ...slip,
      question: {
        kind: "story",
        storyId: "k17first000001",
        text: "Who taught the recipe?",
        lang: "en",
        askedBy: "Hana",
        carriedFrom: { slug: "candle-shop", names: names("Candle Workshop", "ろうそく工房") },
      },
    };
    expect(card("en", { slip: carried })).toContain("Hana asked, from Candle Workshop:");
    expect(card("ja", { slip: carried })).toContain("ろうそく工房から、Hana さんの問い：");
    expect(card("en")).not.toContain("asked, from");
  });

  it("name a carried question's place in the page language, or leave the writer out when unnamed", () => {
    const anonymous: Slip = {
      ...slip,
      thread: [{ ...third, carried: { ...third.carried!, askedBy: "" } } as ThreadStop, second],
    };
    expect(card("en", { slip: anonymous, doors: 0 })).toContain(
      "A question from Candle Workshop leads here.",
    );
    expect(card("ja", { slip: anonymous, doors: 0 })).toContain(
      "ろうそく工房から、ある人の問いがここへ続いています。",
    );
  });

  it("read in Japanese with the supplied copy", () => {
    const html = card("ja", { doors: 2 });
    for (const line of [
      "三軒むすび",
      "あと二軒で糸がつながります。次の一軒は、着くまで封がされています。",
      "二軒目",
      "三軒目",
      "ろうそく工房",
      "近くから、くじで選びました。順位ではありません。",
      "Kenji さんの問いがここへ続いています。",
      "三軒、ひとすじ。Nov 10, 2026に結びました。",
    ])
      expect(html).toContain(line);
    expect(card("ja", { doors: 0 })).toContain("三軒目は、二軒目の封を開けると見えます。");
    expect(html).not.toMatch(/score|\brank\b|points|streak|スコア|ポイント|連続/i);
  });

  it("never counts, scores or ranks a door", () => {
    for (const doors of [0, 1, 2]) {
      const html = card("en", { doors });
      expect(html).not.toMatch(/\d+ of \d+|score|points|streak|best|top /i);
    }
  });

  it("draws a kept slip's tied mark as an inline knot that follows the text colour", () => {
    const html = render(<ThreadTiedMark label="Thread tied" />);
    expect(html).toContain("Thread tied");
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('stroke="currentColor"');
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).not.toContain("<img");
    expect(walkMessages.ja.keptTied).toBe("むすび済み");
  });
});

describe("the region's switches", () => {
  it("make thread a prop only when walk mode and the thread switch are both on", () => {
    expect(on("en")).toMatchObject({ relay: true, thread: true });
    expect(off("en")).not.toHaveProperty("thread");
    expect(publicRegionProps(withSwitches({ walk: false, thread: true }), "en")).not.toHaveProperty(
      "thread",
    );
    expect(publicRegionProps(config, "en")).not.toHaveProperty("thread");
  });
});

const story = (over: Partial<WrittenStoryLike> = {}): WrittenStoryLike => ({
  _id: "k17story00001",
  body: "The sign was repainted.",
  lang: "en",
  authorName: "Ann",
  addedAt: Date.UTC(2026, 10, 1),
  isMock: false,
  canRemove: false,
  ...over,
});
const feed = (stories: WrittenStoryLike[], locale: Locale = "en") =>
  render(
    <StoryFeed
      locale={locale}
      entries={toStoryFeed([], stories, false)}
      scriptOrigins={[]}
      frameOrigins={[]}
      region={on(locale)}
    />,
  );
const target = { slug: "candle-shop", names: names("Candle Workshop", "ろうそく工房") };

describe("a story's question carried to another place", () => {
  it("is labelled with the place, linked to its stories, instead of the next-visitor label", () => {
    const html = feed([story({ nextQuestion: "Who lights them?", nextQuestionFor: target })]);
    expect(html).toContain("A question to carry to");
    expect(html).toContain('href="/en/places/candle-shop?tab=stories"');
    expect(html).toContain("Candle Workshop");
    expect(html).toContain("Who lights them?");
    expect(html).not.toContain("left a question for the next visitor");
    expect(
      feed([story({ nextQuestion: "Who lights them?", nextQuestionFor: target })], "ja"),
    ).toContain("への言づて");
  });

  it("keeps the usual label for a question for the next visitor of this place", () => {
    const html = feed([story({ nextQuestion: "Who lights them?" })]);
    expect(html).toContain("Ann left a question for the next visitor:");
    expect(html).not.toContain("A question to carry to");
  });

  it("names the writer and the place on a story that answers a carried question", () => {
    const html = feed([
      story({
        answers: {
          kind: "story",
          text: "Who lights them?",
          lang: "en",
          askedBy: "Mika",
          from: target,
        },
      }),
    ]);
    expect(html).toContain("Answering:");
    expect(html).toContain("asked by Mika, carried from");
    expect(html).toContain('href="/en/places/candle-shop?tab=stories"');
    expect(
      feed([story({ answers: { kind: "story", text: "Q?", lang: "en", askedBy: "Mika" } })]),
    ).toContain("(asked by Mika)");
  });
});

describe("the block of questions carried here", () => {
  const rows = [
    {
      storyId: "k17carried001",
      text: "二つ目？ Who lights them?",
      lang: "ja",
      askedBy: "Mika",
      from: target,
      addedAt: 1,
    },
    { storyId: "k17carried002", text: "Anon?", lang: "en", askedBy: "", from: target, addedAt: 0 },
  ];

  it("shows who carried each question from where, as written, with the write link", () => {
    const html = render(<CarriedHere locale="en" region={on("en")} slug="tea-house" rows={rows} />);
    expect(html).toContain("Carried here from");
    expect(html).toContain("Candle Workshop");
    expect(html).toContain(" by Mika");
    expect(html).toMatch(/lang="ja"[^>]*>二つ目？ Who lights them\?/);
    expect(html).toContain(
      'href="/en/places/tea-house?tab=stories&amp;write=1&amp;answers=story:k17carried001"',
    );
    expect(html).toContain("Write what you heard");
    expect(html.match(/data-carried-question/g)).toHaveLength(2);
    expect(html).not.toContain("by </");
  });

  it("is nothing when no question is carried here, and reads in Japanese", () => {
    expect(render(<CarriedHere locale="en" region={on("en")} slug="x" rows={[]} />)).toBe("");
    const ja = render(<CarriedHere locale="ja" region={on("ja")} slug="tea-house" rows={rows} />);
    expect(ja).toContain("から、Mika さんの言づて");
    expect(ja).toContain("ろうそく工房");
    expect(ja).toContain(
      'href="/ja/places/tea-house?tab=stories&amp;write=1&amp;answers=story:k17carried001"',
    );
  });
});

describe("the story form's choice of where to ask", () => {
  const actions: AddStoryActions = {
    signedIn: true,
    add: async () => null,
    write: async () => null,
    carryTargets: async () => [],
  };
  const form = (region: ReturnType<typeof on>) =>
    render(<AddStory locale="en" region={region} actions={actions} draftName="story:place" />);

  it("shows only while the thread switch is on, once there is a question", () => {
    const html = form(on("en"));
    expect(html).toContain("Where should they ask it?");
    expect(html).toContain("Here");
    expect(html).toContain("At another place nearby");
    expect(html).toContain('data-carry="here"');
    expect(html).toMatch(/data-carry="here"[^>]*checked/);
    // Nothing is asked for, and the list is not there, until the second choice is made.
    expect(html).not.toContain("Search nearby places");
    expect(html).not.toContain("Your question shows with your story here");
    const without = form(off("en"));
    expect(without).toContain("data-next-question");
    expect(without).not.toContain("Where should they ask it?");
    expect(without).not.toContain("data-carry");
  });

  it("has labels for every control and fits a phone", () => {
    const picker = (other: boolean) =>
      render(
        <CarryPicker
          locale="en"
          id="f"
          other={other}
          placeId={undefined}
          onChange={() => undefined}
          load={async () => []}
          problem={false}
        />,
      );
    const html = picker(true);
    expect(html).toContain("<legend");
    expect(html).toContain(
      "Your question shows with your story here, and on that place&#x27;s page and in its omikuji, with your name.",
    );
    expect(html).not.toMatch(/ style="[^"]*width:\s*\d{3,}px/);
    expect(picker(false)).not.toContain("Your question shows with your story");
  });

  it("sends a place only when the writer chose another place and picked one", () => {
    const draft = (fields: Partial<StoryDraft>): StoryDraft => ({
      url: "",
      note: "",
      title: "",
      author: "",
      body: "A story.",
      question: "Who paints the sign?",
      ...fields,
    });
    const region = { ...on("en"), thread: true };
    expect(toWrittenArgs(draft({}), region)).toEqual({
      ok: true,
      args: { body: "A story.", lang: "en", nextQuestion: "Who paints the sign?" },
    });
    expect(toWrittenArgs(draft({ carryOther: false, carryTo: "p1" }), region)).toMatchObject({
      ok: true,
      args: { nextQuestion: "Who paints the sign?" },
    });
    expect(toWrittenArgs(draft({ carryOther: true }), region)).toEqual({
      ok: false,
      problem: "carry",
    });
    expect(toWrittenArgs(draft({ carryOther: true, carryTo: "p1" }), region)).toEqual({
      ok: true,
      args: {
        body: "A story.",
        lang: "en",
        nextQuestion: "Who paints the sign?",
        nextQuestionFor: "p1",
      },
    });
    // With the switch off, or no question, a stale choice sends nothing.
    expect(
      toWrittenArgs(draft({ carryOther: true, carryTo: "p1" }), { ...region, thread: false }),
    ).toMatchObject({ ok: true, args: { nextQuestion: "Who paints the sign?" } });
    expect(toWrittenArgs(draft({ question: "", carryOther: true, carryTo: "p1" }), region)).toEqual(
      { ok: true, args: { body: "A story.", lang: "en" } },
    );
  });
});
