import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OmikujiPanel, SlipCard } from "@/components/walk/omikuji-panel";
import { WalkCard } from "@/components/walk/walk-card";
import { WalkView, type WalkActions, type WalkRegionProps } from "@/components/walk/walk-view";
import { publicRegionProps } from "@/components/public/mapping";
import type { Locale } from "@/lib/i18n";
import { walkMessages } from "@/lib/i18n/messages/walk";
import type { CardView, WalkSnapshot } from "@/lib/walk/controller";
import { narrate } from "@/lib/walk/narration";
import type { CardKind } from "@/lib/walk/engine";
import type { Snippet, WalkPlace } from "@/lib/walk/types";
import { config } from "../fixtures/public-ui";
import { ORIGIN, walkPlace } from "../fixtures/walk";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/walk",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: false }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
}));

const regionFor = (locale: Locale) => publicRegionProps(config, locale);
const walkProps: WalkRegionProps = {
  regionName: "Nagasaki",
  neighbourhoods: config.neighbourhoods!,
  accuracyAllowanceMetres: 30,
  planner: false,
};
const actions: WalkActions = {
  start: vi.fn(),
  stop: vi.fn(),
  setSound: vi.fn(),
  dismiss: vi.fn(),
  readAloud: vi.fn(),
  stopTalking: vi.fn(),
};
const data = { loadPlaces: vi.fn(), drawToday: vi.fn() };

const IDLE: WalkSnapshot = {
  phase: "idle",
  problem: null,
  loadError: null,
  fix: null,
  fixState: "waiting",
  screen: "off",
  sound: "off",
  speaking: false,
  localVoices: 2,
  placeCount: 0,
  current: null,
  earlier: [],
};

function cardOf(
  kind: CardKind,
  place: WalkPlace,
  locale: Locale = "en",
  over: Partial<CardView> = {},
): CardView {
  return {
    id: 1,
    kind,
    place,
    metres: 42,
    at: 0,
    ...(kind === "detour" ? { minutes: 4 } : {}),
    narration:
      kind === "story" && place.snippet
        ? narrate(place.snippet, locale, walkMessages[locale])
        : null,
    voice: { ok: true },
    ...over,
  };
}

function view(locale: Locale, snapshot: Partial<WalkSnapshot> = {}, planner = false) {
  const region = regionFor(locale);
  return render(
    <WalkView
      locale={locale}
      region={region}
      walk={{ ...walkProps, planner }}
      snapshot={{ ...IDLE, ...snapshot }}
      actions={actions}
      omikuji={
        <OmikujiPanel
          locale={locale}
          region={region}
          regionName="Nagasaki"
          neighbourhoods={walkProps.neighbourhoods}
          planner={planner}
          data={data}
          position={null}
        />
      }
    />,
  );
}

const card = (c: CardView, locale: Locale = "en", planner = false, extra = {}) =>
  render(
    <WalkCard
      locale={locale}
      region={regionFor(locale)}
      card={c}
      planner={planner}
      localVoices={2}
      actions={actions}
      {...extra}
    />,
  );

describe("the page before a walk", () => {
  it("offers Start walk on a phone, and explains on a desktop that walk mode is for phones", () => {
    const html = view("en");
    expect(html).toContain("data-walk-start");
    expect(html).not.toContain("data-walk-stop");
    expect(html).toContain("Start walk");
    // Both are in the page; the pointer decides which shows (fine pointer: the desktop note).
    expect(html).toMatch(/data-walk-desktop[^>]*class="[^"]*hidden[^"]*pointer-fine:block/);
    expect(html).toMatch(/data-walk-phone[^>]*class="[^"]*pointer-fine:hidden/);
    expect(html).toContain("Walk mode is for phones");
  });

  it("says the screen must stay on in iPhone, and that Noren does not get the location", () => {
    const html = view("en");
    expect(html).toContain("On iPhone, keep the screen on");
    expect(html).toContain("cannot read your location in the background");
    expect(html).toContain("hands-free");
    expect(html).toMatch(/data-walk-privacy[^>]*>Your phone works out where you are/);
    expect(html).toContain("Noren does not receive your location");
  });

  it("keeps today's omikuji on the page, desktop or phone", () => {
    const html = view("en");
    expect(html).toContain("data-omikuji");
    expect(html).toContain("Today&#x27;s omikuji (おみくじ)");
    // A neighbourhood to pick, with "Near me" and the whole region beside the neighbourhoods.
    expect(html).toContain("Near me");
    expect(html).toContain(">Suwa<");
    expect(html).toContain("All of Nagasaki");
    expect(html).toContain("data-draw-slip");
  });

  it("is in Japanese too", () => {
    const html = view("ja");
    expect(html).toContain("歩きはじめる");
    expect(html).toContain("歩きモードはスマートフォン向けです");
    expect(html).toContain("今日のおみくじ");
    expect(html).toContain("位置情報は Noren に送られません");
    expect(html).toContain("諏訪");
  });
});

describe("while walking", () => {
  const walking: Partial<WalkSnapshot> = { phase: "walking", placeCount: 1234, screen: "on" };

  it("offers Stop walk and says what it is doing", () => {
    const html = view("en", { ...walking, fixState: "good" });
    expect(html).toContain("data-walk-stop");
    expect(html).not.toContain("data-walk-start");
    expect(html).toContain("Walking. Noren is watching for stories near you.");
    expect(html).toContain("1,234 places are on your phone now.");
    expect(html).toContain("The screen will stay on.");
  });

  it("says when the position is not found or too rough", () => {
    expect(view("en", { ...walking, fixState: "waiting" })).toContain("Finding your position…");
    const rough = view("en", {
      ...walking,
      fixState: "rough",
      fix: { ...ORIGIN, accuracy: 240.4 },
    });
    expect(rough).toContain("Your position is rough (about 240 m)");
  });

  it("tells the person to keep the screen on when the phone refused to hold it", () => {
    for (const screen of ["refused", "unsupported"] as const) {
      const html = view("en", { ...walking, screen });
      expect(html).toContain("data-keep-screen-on");
      expect(html).toContain("Keep the screen on");
    }
    expect(view("en", { ...walking, screen: "on" })).not.toContain("data-keep-screen-on");
    expect(view("ja", { ...walking, screen: "refused" })).toContain(
      "画面をつけたままにしてください",
    );
  });

  it("has a sound switch that says which way it is", () => {
    expect(view("en", walking)).toMatch(/data-walk-sound[^>]*aria-pressed="false"[^>]*>Sound off/);
    expect(view("en", { ...walking, sound: "on" })).toMatch(
      /data-walk-sound[^>]*aria-pressed="true"[^>]*>Sound on/,
    );
    expect(view("en", { ...walking, sound: "on", localVoices: 0 })).toContain("no on-device voice");
  });

  it("puts a big Stop talking button on screen only while speaking", () => {
    expect(view("en", walking)).not.toContain("data-stop-talking");
    const html = view("en", { ...walking, speaking: true });
    expect(html).toContain("data-stop-talking");
    expect(html).toContain("Stop talking");
    expect(html).toMatch(/data-stop-talking[^>]*class="[^"]*min-h-14/);
  });

  it("shows one Stop talking button, the big one, even with a story card on screen", () => {
    const current = cardOf("story", walkPlace("kenjis", ORIGIN, { story: true }));
    const html = view("en", { ...walking, speaking: true, current });
    expect(html.match(/Stop talking/g)).toHaveLength(1);
    expect(html).toContain("data-stop-talking");
  });

  it("says why it stopped, in words", () => {
    const denied = view("en", { problem: "denied" });
    expect(denied).toContain("Noren cannot read your location");
    expect(denied).toContain('role="alert"');
    expect(view("en", { problem: "unsupported" })).toContain("cannot read your location");
    expect(view("en", { problem: "load-failed", loadError: new Error("x") })).toContain(
      "could not load the places",
    );
  });

  it("keeps closed cards under Earlier on this walk, without their buttons", () => {
    const earlier = cardOf("story", walkPlace("old", ORIGIN, { story: true }));
    const html = view("en", { ...walking, earlier: [{ ...earlier, id: 9 }] });
    expect(html).toContain("Earlier on this walk");
    expect(html).toContain('data-place="old"');
  });
});

describe("a story card", () => {
  const place = (snippet: Snippet, over: Partial<WalkPlace> = {}) =>
    walkPlace("kenjis", ORIGIN, { story: true, snippet, ...over });
  const member: Snippet = {
    kind: "member",
    writer: "Kenji",
    lang: "en",
    text: "The champon is just as it was.",
    more: true,
  };

  it("names the writer before the words, and gives the words as written", () => {
    const html = card(cardOf("story", place(member)));
    expect(html.indexOf("Kenji wrote:")).toBeGreaterThan(-1);
    expect(html).not.toContain("who runs it");
    expect(html.indexOf("Kenji wrote:")).toBeLessThan(
      html.indexOf("The champon is just as it was."),
    );
    expect(html).toMatch(
      /<blockquote lang="en"[^>]*>The champon is just as it was\.<\/blockquote>/,
    );
    expect(html).toContain("Near you · 42 m away");
    expect(html).toContain("Place kenjis");
    expect(html).toContain("店kenjis");
    expect(html).toContain("Read the whole story");
    expect(html).toContain('href="/en/places/kenjis?tab=stories"');
    expect(html).toContain('target="_blank"');
  });

  it("labels a place nobody has confirmed, and not one somebody has", () => {
    expect(card(cardOf("story", place(member, { confirmed: false })))).toContain(
      'data-badge="unconfirmed"',
    );
    expect(card(cardOf("story", place(member)))).not.toContain('data-badge="unconfirmed"');
  });

  it("labels Noren's AI story, says how many posts it read, and where they are", () => {
    const stitched: Snippet = {
      kind: "stitched",
      postsRead: 3,
      platforms: ["x", "web", "reddit"],
      sentences: [
        { en: "One reviewer says the champon is unchanged.", ja: "ちゃんぽんは昔のまま。" },
      ],
    };
    const html = card(cardOf("story", place(stitched)));
    expect(html).toContain("Noren&#x27;s AI stitched this from public posts:");
    expect(html).toContain("Stitched by Noren&#x27;s AI from 3 posts. AI can misread them");
    expect(html).toContain("Posts from X, web pages, Reddit.");
    expect(html).toContain("One reviewer says the champon is unchanged.");
    const japanese = card(cardOf("story", place(stitched), "ja"), "ja");
    expect(japanese).toContain("Noren の AI が、公開されている投稿から仕立てました。");
    expect(japanese).toContain("ちゃんぽんは昔のまま。");
  });

  it("labels a machine translation with the badge, before its words", () => {
    const post: Snippet = {
      kind: "post",
      author: "@synthetic",
      lang: "ja",
      text: "ここのちゃんぽんは昔のまま。",
      more: false,
      translations: [{ lang: "en", text: "The champon is just as it was." }],
    };
    const html = card(cardOf("story", place(post)));
    expect(html).toContain("A machine translation of a public post by @synthetic:");
    expect(html).toContain('data-badge="machine-translation"');
    expect(html.indexOf('data-badge="machine-translation"')).toBeLessThan(
      html.indexOf("The champon is just as it was."),
    );
    expect(html).toContain("A short quote from a public post");
  });

  it("says when the words are in another language than the page", () => {
    const html = card(
      cardOf("story", place({ ...member, lang: "ja", text: "ちゃんぽんは昔のままです。" })),
    );
    expect(html).toContain("Written in Japanese.");
    expect(html).toContain('lang="ja"');
    expect(card(cardOf("story", place(member)))).not.toContain("Written in");
  });

  it("offers Read aloud when a local voice can read it, and says why not when none can", () => {
    expect(card(cardOf("story", place(member)))).toContain("Read aloud");
    const noJapanese = card(
      cardOf("story", place({ ...member, lang: "ja", text: "昔のまま。" }), "en", {
        voice: { ok: false, missing: ["ja"] },
      }),
    );
    expect(noJapanese).not.toContain("Read aloud");
    expect(noJapanese).toContain("no on-device voice for Japanese");
    expect(noJapanese).toContain("昔のまま。");
    const none = card(
      cardOf("story", place(member), "en", { voice: { ok: false, missing: [] } }),
      "en",
      false,
      { localVoices: 0 },
    );
    expect(none).toContain("This phone has no on-device voice");
  });

  it("is a link to the stories when the place has a story but nothing to read", () => {
    const html = card(cardOf("story", walkPlace("x", ORIGIN, { hasStory: true })));
    expect(html).toContain("People have shared stories about this place.");
    expect(html).toContain("Read the stories");
    expect(html).not.toContain("Read aloud");
  });

  it("offers Ask about this place only while the planner is on, as a plain link", () => {
    const c = cardOf("story", place(member));
    expect(card(c, "en", false)).not.toContain("Ask about this place");
    const html = card(c, "en", true);
    expect(html).toContain("Ask about this place");
    expect(html).toContain('href="/en/plan?place=kenjis"');
    expect(card(c, "ja", true)).toContain('href="/ja/plan?place=kenjis"');
  });
});

describe("the first-story card and the detour card", () => {
  const quiet = walkPlace("old-bakery", ORIGIN);

  it("asks the person to be the first, with a Write a story button that opens the story form", () => {
    const html = card(cardOf("first-story", quiet));
    expect(html).toContain(
      "Nobody has written about Place old-bakery yet. Go in and be the first.",
    );
    expect(html).toContain("Write a story");
    expect(html).toContain('href="/en/places/old-bakery?tab=stories&amp;write=1"');
    // New tab, so the walk keeps going.
    expect(html).toContain('target="_blank"');
    expect(html).toContain("so your walk keeps going");
    expect(card(cardOf("first-story", quiet, "ja"), "ja")).toContain("話を書く");
  });

  it("labels the unconfirmed place on a nudge too", () => {
    expect(card(cardOf("first-story", { ...quiet, confirmed: false }))).toContain(
      'data-badge="unconfirmed"',
    );
  });

  it("suggests a detour gently, with its minutes, and says it is a random pick", () => {
    const lane = card(cardOf("detour", quiet));
    expect(lane).toContain("There&#x27;s a lane nobody has mentioned 4 min away.");
    expect(lane).toContain("A random pick, drawn on your phone. Not a recommendation.");
    const known = card(cardOf("detour", walkPlace("busy", ORIGIN, { story: true })));
    expect(known).toContain("A short detour: 4 min away.");
    expect(known).not.toContain("nobody has mentioned");
    expect(lane).not.toMatch(/score|rating|stars|rank/i);
  });
});

describe("a slip from today's omikuji", () => {
  const slipPlace = (over: Record<string, unknown> = {}) => ({
    place: {
      slug: "lane-cafe",
      names: [
        { lang: "en", script: "latin" as const, value: "Lane Cafe", isPrimary: true },
        { lang: "ja", script: "kanji" as const, value: "路地の店", isPrimary: true },
      ],
      category: "cafe",
      confirmedAt: 5,
      hasStory: false,
      pin: { lat: ORIGIN.lat + 0.0043, lng: ORIGIN.lng },
      ...over,
    },
  });
  const suwa = config.neighbourhoods!.find(({ id }) => id === "suwa")!;
  const m = walkMessages.en;
  const slip = (
    over: {
      slip?: ReturnType<typeof slipPlace>;
      from?: typeof ORIGIN | null;
      planner?: boolean;
    } = {},
  ) =>
    render(
      <SlipCard
        locale="en"
        region={regionFor("en")}
        m={m}
        write="Write a story"
        planner={over.planner ?? false}
        slip={over.slip ?? slipPlace()}
        heading="Today's slip for Suwa, Nov 10, 2026"
        from={over.from === undefined ? ORIGIN : over.from}
        centre={config.neighbourhoods!.find(({ id }) => id === "suwa")}
      />,
    );

  it("names the place, how far, how long on foot and which way", () => {
    const html = slip();
    expect(html).toContain("Lane Cafe");
    expect(html).toContain("路地の店");
    // 0.0043 degrees is about 478 m; x1.3 = 622 m, about 8 minutes, due north.
    expect(html).toMatch(/data-slip-leg[^>]*>About 620 m, 8 min on foot, to the north\./);
  });

  it("measures from the middle of the neighbourhood when it does not know where the person is", () => {
    expect(slip({ from: null })).toMatch(
      /data-slip-leg[^>]*>About [\d,]+ m, \d+ min on foot, to the [a-z-]+, from the middle of Suwa\./,
    );
  });

  it("says it is right here, or right at the middle, instead of a distance of nothing", () => {
    const here = slip({ from: { lat: ORIGIN.lat + 0.0043, lng: ORIGIN.lng } });
    expect(here).toMatch(/data-slip-leg[^>]*>It is right here\./);
    const atMiddle = slip({ from: null, slip: slipPlace({ pin: suwa.center }) });
    expect(atMiddle).toMatch(/data-slip-leg[^>]*>It is right at the middle of Suwa\./);
  });

  it("says the first-story line and offers Write a story when nobody has written about it", () => {
    const html = slip();
    expect(html).toContain("Nobody has written about Lane Cafe yet. Go in and be the first.");
    expect(html).toContain('href="/en/places/lane-cafe?tab=stories&amp;write=1"');
    expect(html).toContain("Write a story");
  });

  it("links to the stories instead when there are some", () => {
    const html = slip({ slip: slipPlace({ hasStory: true }) });
    expect(html).not.toContain("Be the first");
    expect(html).not.toContain("be the first");
    expect(html).toContain('href="/en/places/lane-cafe?tab=stories"');
  });

  it("says it is a random pick and labels an unconfirmed place", () => {
    const html = slip({ slip: slipPlace({ confirmedAt: undefined }) });
    expect(html).toContain("A random pick for the day. It is not a ranking and not a fortune.");
    expect(html).toContain('data-badge="unconfirmed"');
    expect(html).not.toMatch(/大吉|凶|lucky/i);
  });

  it("offers Ask about this place only while the planner is on", () => {
    expect(slip()).not.toContain("/plan?place=");
    expect(slip({ planner: true })).toContain('href="/en/plan?place=lane-cafe"');
  });
});

describe("what the page shows of the person's position", () => {
  it("never puts coordinates in a link or the markup", () => {
    const place = walkPlace("kenjis", ORIGIN, { story: true });
    const html = view("en", {
      phase: "walking",
      fix: { lat: 32.74151234, lng: 129.87551234, accuracy: 12 },
      fixState: "good",
      current: cardOf("story", place),
      earlier: [{ ...cardOf("first-story", walkPlace("quiet", ORIGIN)), id: 2 }],
    });
    for (const fragment of ["32.7415", "129.8755", "lat=", "lng=", "latitude", "longitude"])
      expect(html).not.toContain(fragment);
  });
});
