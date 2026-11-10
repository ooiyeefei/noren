/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are JSON, read here by key */
import { describe, expect, it, vi } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import {
  ASSISTANT_RULES,
  CONNECTOR_TOOLS,
  SLIP_HAS_STORY,
  SLIP_NO_STORY,
  WILD_CARD_WHY,
  drawOmikuji,
  getPlace,
  listCollections,
  searchPlaces,
  suggestWalk,
  whyStop,
  type ToolResult,
} from "@/lib/connector/tools";
import {
  CONNECTOR_DEFAULTS,
  connectorMayShareMemberPost,
  connectorMayShareStory,
} from "@/lib/connector/policy";
import {
  ConnectorDataError,
  type ConnectorData,
  type ListedPlace,
  type PlaceBundle,
  type ToolContext,
  type WalkResult,
} from "@/lib/connector/types";
import { regionSchema } from "@/lib/region/schema";

const region = regionSchema.parse(nagasaki);
const ORIGIN = "https://noren.yooi.me";
const NOW = Date.UTC(2026, 10, 10, 3, 0, 0);

/** Fixtures are partial on purpose: the tools must read only the fields they are given. */
const as = <T>(value: unknown) => value as T;

const names = (english: string | null, japanese: string | null, kana?: string) => [
  ...(english ? [{ lang: "en", script: "latin", value: english, isPrimary: true }] : []),
  ...(japanese ? [{ lang: "ja", script: "kanji", value: japanese, isPrimary: true }] : []),
  ...(kana ? [{ lang: "ja", script: "kana", value: kana, isPrimary: false }] : []),
];

function listed(over: Record<string, unknown> & { slug: string }): ListedPlace {
  return as<ListedPlace>({
    _id: `id-${over.slug}`,
    regionId: "nagasaki",
    kind: "business",
    visibility: "public",
    isMock: false,
    category: "cafe",
    names: names("Test Cafe", "テストカフェ"),
    pin: { lat: 32.7437, lng: 129.8728 },
    hasStory: false,
    ...over,
  });
}

const PLACES: ListedPlace[] = [
  listed({
    slug: "dejima-museum",
    category: "museum",
    names: names("Dejima Museum", "出島資料館"),
    pin: { lat: 32.7437, lng: 129.8728 },
    confirmedAt: 1,
    hasStory: true,
  }),
  listed({
    slug: "shinchi-noodles",
    category: "restaurant",
    names: names("Shinchi Noodles", "新地ヌードル", "しんちぬーどる"),
    pin: { lat: 32.7415, lng: 129.8755 },
  }),
  listed({
    slug: "kamera-ya",
    category: "shop",
    names: names(null, null, "カメラや"),
    pin: { lat: 32.7442, lng: 129.8731 },
    confirmedAt: 2,
  }),
  listed({
    slug: "demo-bakery",
    category: "cafe",
    isMock: true,
    names: names("Demo Bakery", "デモパン屋"),
    pin: { lat: 32.7415, lng: 129.8755 },
  }),
  listed({
    slug: "oura-bar",
    category: "bar",
    names: names("Oura Bar", "大浦バー"),
    pin: { lat: 32.7352, lng: 129.8703 },
  }),
];

const BANNED_KEYS = [
  "score",
  "rank",
  "rating",
  "stars",
  "weight",
  "popularity",
  "percent",
  "_id",
  "pin",
  "lat",
  "lng",
  "regionId",
  "visibility",
  "canEdit",
  "canManage",
  "hasOwner",
  "isOwner",
  "addedByMe",
  "canRemove",
  "authorKey",
  "hasDemoConsent",
  "createdBy",
  "email",
  "tokenIdentifier",
];

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (typeof value === "object" && value !== null)
    for (const [key, inner] of Object.entries(value)) {
      found.add(key);
      keysOf(inner, found);
    }
  return found;
}

function expectNoPrivateOrRankingKeys(result: unknown) {
  const keys = [...keysOf(result)].map((key) => key.toLowerCase());
  for (const banned of BANNED_KEYS)
    expect(keys, `a "${banned}" key leaked`).not.toContain(banned.toLowerCase());
}

function fakeData(over: Partial<ConnectorData> = {}): ConnectorData {
  return {
    listPlaces: async () => PLACES,
    placeBundle: async () => null,
    listSets: async () => [],
    walk: async () => ({ ok: false, reason: "unknown_place" }),
    omikuji: async () => ({ ok: false, reason: "no_places" }),
    ...over,
  };
}

const context = (data: ConnectorData, options = CONNECTOR_DEFAULTS): ToolContext => ({
  data,
  region,
  origin: ORIGIN,
  options,
  now: () => NOW,
});

function ok(result: ToolResult): Record<string, any> {
  if (!result.ok) throw new Error(`expected a result, got: ${result.message}`);
  return result.result as Record<string, any>;
}
function failed(result: ToolResult): string {
  if (result.ok) throw new Error("expected a problem, got a result");
  return result.message;
}

describe("the policy for member stories", () => {
  it("lets a story out only when its writer allowed it, through the connector", () => {
    expect(connectorMayShareStory({ connectorAllowed: true })).toBe(true);
    expect(connectorMayShareStory({ connectorAllowed: false })).toBe(false);
    expect(connectorMayShareStory({ connectorAllowed: false }, CONNECTOR_DEFAULTS)).toBe(false);
  });

  it("lets every shown story out for Noren's own planner", () => {
    const inApp = { memberStories: "all-shown" } as const;
    expect(connectorMayShareStory({ connectorAllowed: false }, inApp)).toBe(true);
    expect(connectorMayShareStory({ connectorAllowed: true }, inApp)).toBe(true);
  });

  it("holds a member's note on a shared post back from the connector until a tick exists", () => {
    expect(connectorMayShareMemberPost()).toBe(false);
    expect(connectorMayShareMemberPost({ memberStories: "all-shown" })).toBe(true);
  });
});

describe("every tool", () => {
  it("is a read-only Noren tool whose description carries the assistant's rules", () => {
    expect(CONNECTOR_TOOLS.map((tool) => tool.name)).toEqual([
      "search_places",
      "get_place",
      "list_collections",
      "suggest_walk",
      "draw_omikuji",
    ]);
    for (const tool of CONNECTOR_TOOLS) {
      expect(tool.description).toContain(ASSISTANT_RULES);
      expect(tool.description.length).toBeGreaterThan(150);
    }
    expect(ASSISTANT_RULES).toMatch(/credit each story's writer by name/i);
    expect(ASSISTANT_RULES).toMatch(/Link to the Noren page/);
    expect(ASSISTANT_RULES).toMatch(/machine translations and AI-stitched stories/);
    expect(ASSISTANT_RULES).toMatch(/Do not add facts that are not in the returned text/);
    expect(ASSISTANT_RULES).toMatch(/no ratings, scores or rankings/);
  });

  it("takes no coordinates anywhere in its input", () => {
    for (const tool of CONNECTOR_TOOLS) {
      const text = JSON.stringify((tool.inputSchema as any).toJSONSchema());
      expect(text).not.toMatch(/"(lat|lng|latitude|longitude|coordinates?)"/i);
    }
  });
});

describe("search_places", () => {
  const run = async (input: Record<string, unknown>) =>
    searchPlaces.run(searchPlaces.inputSchema.parse(input), context(fakeData()));

  it("lists names English first with Japanese beside, the category, neighbourhood and page link", async () => {
    const result = ok(await run({ query: "Dejima Museum" }));
    expect(result.places).toHaveLength(1);
    expect(result.places[0]).toMatchObject({
      slug: "dejima-museum",
      name: "Dejima Museum (出島資料館)",
      category: { key: "museum", en: "Museum", ja: "美術館・博物館・資料館" },
      neighbourhood: { id: "dejima", en: "Dejima", ja: "出島" },
      hasStory: true,
      url: "https://noren.yooi.me/en/places/dejima-museum",
    });
    expect(result.places[0].names.map((n: any) => n.value)).toEqual([
      "Dejima Museum",
      "出島資料館",
    ]);
  });

  it("puts places whose name matches before places that only share the neighbourhood", async () => {
    const result = ok(await run({ query: "dejima" }));
    expect(result.places.map((p: any) => p.slug)).toEqual(["dejima-museum", "kamera-ya"]);
  });

  it("finds a place by romaji against a kana name, and by Japanese text", async () => {
    expect(ok(await run({ query: "kamera" })).places.map((p: any) => p.slug)).toEqual([
      "kamera-ya",
    ]);
    expect(ok(await run({ query: "カメラ" })).places.map((p: any) => p.slug)).toEqual([
      "kamera-ya",
    ]);
    expect(ok(await run({ query: "出島資料館" })).places.map((p: any) => p.slug)).toEqual([
      "dejima-museum",
    ]);
    expect(ok(await run({ query: "Shinchi noodles" })).places.map((p: any) => p.slug)).toEqual([
      "shinchi-noodles",
    ]);
  });

  it("labels a place no one has checked 'Not yet confirmed' and says when a member confirmed it", async () => {
    const result = ok(await run({ category: "restaurant" }));
    expect(result.places[0].confirmation).toEqual({ confirmed: false, label: "Not yet confirmed" });
    const confirmed = ok(await run({ category: "museum" }));
    expect(confirmed.places[0].confirmation.confirmed).toBe(true);
    expect(confirmed.places[0].confirmation.label).not.toBe("Not yet confirmed");
  });

  it("marks a demo place as Demo", async () => {
    const result = ok(await run({ query: "demo bakery" }));
    expect(result.places[0].demo).toBe("Demo");
  });

  it("filters by category (key or label) and by neighbourhood (id or name)", async () => {
    expect(ok(await run({ category: "Café" })).places.map((p: any) => p.slug)).toEqual([
      "demo-bakery",
    ]);
    expect(
      ok(await run({ neighbourhood: "新地中華街" }))
        .places.map((p: any) => p.slug)
        .toSorted(),
    ).toEqual(["demo-bakery", "shinchi-noodles"]);
    expect(ok(await run({ category: "cafe", neighbourhood: "Shinchi" })).places).toHaveLength(1);
  });

  it("builds links in Japanese on request", async () => {
    const result = ok(await run({ query: "dejima", language: "ja" }));
    expect(result.places[0].url).toBe("https://noren.yooi.me/ja/places/dejima-museum");
  });

  it("asks for something to search by, and names the choices when a filter is unknown", async () => {
    expect(failed(await run({}))).toMatch(/at least one/);
    expect(failed(await run({ category: "spaceport" }))).toMatch(/Categories: restaurant, cafe/);
    expect(failed(await run({ neighbourhood: "nowhere" }))).toMatch(
      /Neighbourhood ids: nagasaki-station, suwa/,
    );
  });

  it("caps the list and says how many matched", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      listed({ slug: `cafe-${i}`, names: names(`Cafe ${i}`, null) }),
    );
    const result = ok(
      await searchPlaces.run(
        searchPlaces.inputSchema.parse({ query: "cafe", limit: 5 }),
        context(fakeData({ listPlaces: async () => many })),
      ),
    );
    expect(result.showing).toBe(5);
    expect(result.matching).toBe(30);
    expect(result.note).toMatch(/30 places match and 5 are shown/);
  });

  it("returns no ranking, score, weight or private field", async () => {
    expectNoPrivateOrRankingKeys(ok(await run({ category: "cafe" })));
    expectNoPrivateOrRankingKeys(ok(await run({ query: "dejima" })));
  });

  it("keeps the same order all day and changes it with the day", async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      listed({ slug: `cafe-${i}`, names: names(`Cafe ${i}`, null) }),
    );
    const search = async (now: number) =>
      ok(
        await searchPlaces.run(searchPlaces.inputSchema.parse({ query: "cafe", limit: 20 }), {
          ...context(fakeData({ listPlaces: async () => many })),
          now: () => now,
        }),
      ).places.map((p: any) => p.slug);
    const today = await search(NOW);
    expect(await search(NOW + 3 * 3_600_000)).toEqual(today);
    expect(await search(NOW + 24 * 3_600_000)).not.toEqual(today);
  });

  it("hears about a busy Noren as a plain message", async () => {
    const busy = fakeData({
      listPlaces: async () => {
        throw new ConnectorDataError("rate_limited", "x");
      },
    });
    expect(
      failed(await searchPlaces.run(searchPlaces.inputSchema.parse({ query: "a" }), context(busy))),
    ).toMatch(/try again in a minute/);
  });
});

/** A place page with every layer a signed-out visitor can see. */
function bundle(over: Partial<PlaceBundle> = {}): PlaceBundle {
  const story = (n: number, allowed: boolean, extra: Record<string, unknown> = {}) => ({
    _id: `story-${n}`,
    body: `Story body ${n}: the cat sleeps on the steps.`,
    lang: n === 2 ? "ja" : "en",
    authorName: `Writer ${n}`,
    authorKey: `key-${n}`,
    addedAt: NOW - n * 86_400_000,
    isMock: false,
    addedByMe: false,
    canRemove: false,
    photos: [],
    connectorAllowed: allowed,
    ...extra,
  });
  return as<PlaceBundle>({
    place: {
      _id: "id-dejima-museum",
      regionId: "nagasaki",
      slug: "dejima-museum",
      kind: "business",
      visibility: "public",
      category: "museum",
      isMock: false,
      names: names("Dejima Museum", "出島資料館"),
      pin: { lat: 32.7437, lng: 129.8728 },
      confirmedAt: undefined,
      canEdit: false,
      canManage: false,
      hasOwner: false,
      isOwner: false,
      dataSources: [
        {
          provider: "osm",
          ref: "node/1",
          licence: "ODbL-1.0",
          attribution: "© OpenStreetMap contributors",
        },
      ],
    },
    stories: [
      story(1, true, {
        photos: [{ _id: "ph", key: "k", width: 1, height: 1, waiting: false, canRemove: false }],
      }),
      story(2, false),
      story(3, false),
    ],
    placeStory: null,
    page: null,
    sources: [],
    set: null,
    ...over,
  });
}

const placeCtx = (b: PlaceBundle | null, options = CONNECTOR_DEFAULTS) =>
  context(fakeData({ placeBundle: async () => b }), options);
const getIt = (b: PlaceBundle | null, options = CONNECTOR_DEFAULTS, language?: "en" | "ja") =>
  getPlace.run(
    getPlace.inputSchema.parse({ slug: "dejima-museum", language }),
    placeCtx(b, options),
  );

describe("get_place: member stories", () => {
  it("returns the words and writer of a story only when its writer allowed it", async () => {
    const result = ok(await getIt(bundle()));
    const { memberStories } = result;
    expect(memberStories.total).toBe(3);
    expect(memberStories.stories).toHaveLength(1);
    expect(memberStories.stories[0]).toMatchObject({
      writer: "Writer 1",
      language: "en",
      text: "Story body 1: the cat sleeps on the steps.",
      photos: { count: 1, credit: "Photo by Writer 1" },
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain("Writer 2");
    expect(text).not.toContain("Writer 3");
    expect(text).not.toContain("Story body 2");
    expect(text).not.toContain("Story body 3");
    expect(memberStories.heldBack).toBe(2);
    expect(memberStories.readOnNoren).toBe(
      "Read the member stories on Noren: https://noren.yooi.me/en/places/dejima-museum",
    );
  });

  it("gives only a count and a link when no writer allowed it", async () => {
    const none = bundle({
      stories: bundle().stories.map((story) => ({ ...story, connectorAllowed: false, photos: [] })),
    });
    const result = ok(await getIt(none));
    expect(result.memberStories.stories).toEqual([]);
    expect(result.memberStories.total).toBe(3);
    expect(result.memberStories.heldBack).toBe(3);
    expect(result.memberStories.readOnNoren).toContain("Read the member stories on Noren: ");
    const text = JSON.stringify(result);
    for (const n of [1, 2, 3]) {
      expect(text).not.toContain(`Writer ${n}`);
      expect(text).not.toContain(`Story body ${n}`);
    }
    expect(text).not.toContain("Photo by");
  });

  it("includes every story the page shows when Noren's own planner asks", async () => {
    const result = ok(await getIt(bundle(), { memberStories: "all-shown" }));
    expect(result.memberStories.stories.map((s: any) => s.writer)).toEqual([
      "Writer 1",
      "Writer 2",
      "Writer 3",
    ]);
    expect(result.memberStories.heldBack).toBeUndefined();
    expect(result.memberStories.readOnNoren).toBeUndefined();
    // The original language comes with the text; there is no stored translation of a story to add.
    expect(result.memberStories.stories[1].language).toBe("ja");
  });

  it("withholds a member's note on a shared post from the connector but not from the planner", async () => {
    const shared = {
      _id: "src-1",
      platform: "instagram",
      canonicalUrl: "https://example.com/p/1",
      creatorNote: "My own line about the post",
      noteLang: "en",
      sharedBy: "Poster Name",
      isMock: false,
    };
    const b = bundle({ stories: [], sources: [as(shared)] });
    const text = JSON.stringify(ok(await getIt(b)));
    expect(text).not.toContain("My own line");
    expect(text).not.toContain("Poster Name");
    expect(ok(await getIt(b)).memberStories.heldBack).toBe(1);
    const inApp = ok(await getIt(b, { memberStories: "all-shown" }));
    expect(inApp.memberStories.sharedPosts[0]).toMatchObject({
      sharedBy: "Poster Name",
      note: "My own line about the post",
    });
  });

  it("says plainly when no one has written yet, and offers the link to write", async () => {
    const result = ok(await getIt(bundle({ stories: [] })));
    expect(result.memberStories).toEqual({ total: 0, stories: [] });
    expect(result.place.writeAStoryUrl).toBe(
      "https://noren.yooi.me/en/places/dejima-museum?tab=stories&write=1",
    );
  });
});

describe("get_place: the rest of the page", () => {
  it("names the place in every script, labels it not yet confirmed and links its page", async () => {
    const result = ok(await getIt(bundle(), CONNECTOR_DEFAULTS, "ja"));
    expect(result.place).toMatchObject({
      name: "Dejima Museum (出島資料館)",
      confirmation: { confirmed: false, label: "Not yet confirmed" },
      url: "https://noren.yooi.me/ja/places/dejima-museum",
      neighbourhood: { id: "dejima" },
    });
    expect(result.credits).toContainEqual({
      for: "Place details",
      credit: "© OpenStreetMap contributors",
      licence: "ODbL-1.0",
    });
  });

  it("labels a story Noren's AI stitched, with numbered sources and links to the originals", async () => {
    const stitched = as<PlaceBundle["placeStory"]>({
      sentences: [
        {
          en: "A reviewer says it began as a stall.",
          ja: "屋台から始まったそうです。",
          notes: [0, 1],
        },
        { en: "Another mentions the upstairs.", ja: "二階があるそうです。", notes: [1] },
      ],
      notes: [
        {
          sourceId: "s1",
          words: "屋台から始まりました",
          lang: "ja",
          platform: "google_maps",
          canonicalUrl: "https://maps.example/r/1",
          authorHandle: "synthetic author",
          postedAt: NOW,
          countsVisits: true,
        },
        {
          sourceId: "s2",
          words: "There is an upstairs",
          platform: "web",
          canonicalUrl: "https://example.com/blog",
          countsVisits: false,
        },
      ],
      postsRead: 2,
    });
    const result = ok(await getIt(bundle({ placeStory: stitched })));
    expect(result.stitchedStory.label.en).toMatch(/^Stitched by Noren's AI from 2 posts\./);
    expect(result.stitchedStory.label.ja).toBeTruthy();
    expect(result.stitchedStory.sentences[0]).toMatchObject({ sources: [1, 2] });
    expect(result.stitchedStory.sources[0]).toMatchObject({
      number: 1,
      words: "屋台から始まりました",
      author: "synthetic author",
      link: "https://maps.example/r/1",
    });
    expect(result.stitchedStory.sources[1]).toMatchObject({
      number: 2,
      link: "https://example.com/blog",
    });
  });

  it("shows a found public post as a short quote with its author, a link and a machine-translation label", async () => {
    const found = as<PlaceBundle["sources"][number]>({
      _id: "src-found",
      platform: "x",
      canonicalUrl: "https://x.example/status/1",
      foundInPublicPost: true,
      foundKind: "story",
      excerpt: "ここのちゃんぽんは昔のまま。",
      excerptLang: "ja",
      excerptTranslations: [{ lang: "en", text: "The champon here is just as it was." }],
      authorHandle: "@synthetic_author",
      postedAt: NOW,
      isMock: false,
    });
    const result = ok(await getIt(bundle({ stories: [], sources: [found] })));
    expect(result.foundPosts[0]).toMatchObject({
      kind: "story",
      quote: "ここのちゃんぽんは昔のまま。",
      quoteLanguage: "ja",
      author: "@synthetic_author",
      platform: "x",
      link: "https://x.example/status/1",
      translations: [
        {
          language: "en",
          text: "The champon here is just as it was.",
          label: "Machine translation",
        },
      ],
    });
  });

  it("gives cautions from the fixed vocabulary and translations labelled machine or human", async () => {
    const page = as<PlaceBundle["page"]>({
      claims: [
        {
          kind: "caution",
          cautionType: "cash_only",
          textOriginal: "現金のみです。",
          langOriginal: "ja",
          origin: "interview",
          status: "published",
          translations: [],
          aiAssisted: false,
          isMock: false,
        },
        {
          kind: "story",
          textOriginal: "祖父が始めた店です。",
          langOriginal: "ja",
          origin: "interview",
          status: "published",
          aiAssisted: true,
          isMock: false,
          translations: [
            { lang: "en", text: "My grandfather started the shop.", origin: "machine" },
            { lang: "zh", text: "我祖父开了这家店。", origin: "human" },
          ],
        },
      ],
    });
    const result = ok(await getIt(bundle({ page, stories: [] })));
    expect(result.cautions[0]).toMatchObject({
      key: "cash_only",
      label: { en: "Cash only", ja: "現金のみ" },
      labelReviewedByJapaneseSpeaker: false,
      ownerWords: { text: "現金のみです。", language: "ja" },
    });
    expect(result.ownerStatements[0].translations).toEqual([
      { language: "en", text: "My grandfather started the shop.", label: "Machine translation" },
      { language: "zh", text: "我祖父开了这家店。", label: "Translation confirmed by a person" },
    ]);
    expect(result.ownerStatements[0].aiAssisted).toBe("Written with help from AI");
  });

  it("carries the attribution of open text", async () => {
    const page = as<PlaceBundle["page"]>({
      claims: [
        {
          kind: "fact",
          textOriginal: "1634年に造られた人工島。",
          langOriginal: "ja",
          origin: "open_text",
          status: "published",
          aiAssisted: false,
          isMock: false,
          translations: [],
          openText: {
            sourceUrl: "https://ja.wikipedia.org/wiki/x",
            attribution: "Wikipedia contributors",
            licence: "CC-BY-SA-4.0",
          },
        },
      ],
    });
    const result = ok(await getIt(bundle({ page, stories: [] })));
    expect(result.ownerStatements[0].credit).toEqual({
      attribution: "Wikipedia contributors",
      licence: "CC-BY-SA-4.0",
      source: "https://ja.wikipedia.org/wiki/x",
    });
  });

  it("marks anything fictional as Demo", async () => {
    const demo = bundle();
    demo.place = { ...demo.place, isMock: true };
    demo.stories = demo.stories.map((story) => ({
      ...story,
      isMock: true,
      connectorAllowed: true,
    }));
    const result = ok(await getIt(demo));
    expect(result.place.demo).toBe("Demo");
    expect(result.place.demoNote).toMatch(/not a real place/);
    expect(result.memberStories.stories.every((s: any) => s.demo === "Demo")).toBe(true);
  });

  it("names the stamp collection a place belongs to", async () => {
    const set = as<PlaceBundle["set"]>({
      neighbourhoodId: "dejima",
      setNames: { en: "Dejima", ja: "出島" },
      visited: false,
      dyedPanels: [],
    });
    const result = ok(await getIt(bundle({ set })));
    expect(result.place.stampCollection).toMatchObject({
      name: { en: "Dejima", ja: "出島" },
      url: "https://noren.yooi.me/en/collection/dejima",
    });
    // Personal progress never comes through.
    expect(JSON.stringify(result)).not.toMatch(/visited|dyed/);
  });

  it("returns nothing private, and no ranking, whatever the page holds", async () => {
    expectNoPrivateOrRankingKeys(ok(await getIt(bundle(), { memberStories: "all-shown" })));
    expectNoPrivateOrRankingKeys(ok(await getIt(bundle())));
  });

  it("says so when no public place has that slug", async () => {
    expect(failed(await getIt(null))).toMatch(/No public place has the slug "dejima-museum"/);
  });
});

describe("list_collections", () => {
  const sets = [
    {
      set: as<any>({
        neighbourhoodId: "shinchi",
        names: { en: "Shinchi", ja: "新地中華街" },
        dyedCount: 0,
        panels: [{ dyed: false, artUrl: null }],
      }),
      detail: as<any>({
        panels: [
          { places: [{ slug: "shinchi-noodles", names: [], pin: { lat: 1, lng: 1 }, line: null }] },
          {
            places: [
              {
                slug: "taken-off-the-map",
                names: [],
                pin: null,
                line: { en: "x", ja: "y", postsRead: 1 },
              },
            ],
          },
        ],
        finished: false,
        wholeArtUrl: null,
      }),
    },
  ];

  it("lists each set with its places and page links, and leaves out a place the map does not list", async () => {
    const result = ok(
      await listCollections.run(
        listCollections.inputSchema.parse({}),
        context(fakeData({ listSets: async () => sets })),
      ),
    );
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]).toMatchObject({
      id: "shinchi",
      name: { en: "Shinchi", ja: "新地中華街" },
      url: "https://noren.yooi.me/en/collection/shinchi",
    });
    expect(result.collections[0].places.map((p: any) => p.slug)).toEqual(["shinchi-noodles"]);
    expect(result.collections[0].places[0].url).toBe(
      "https://noren.yooi.me/en/places/shinchi-noodles",
    );
  });

  it("shows no one's progress, art or finish", async () => {
    const result = ok(
      await listCollections.run(
        listCollections.inputSchema.parse({}),
        context(fakeData({ listSets: async () => sets })),
      ),
    );
    expect(JSON.stringify(result)).not.toMatch(/dyed|finished|artUrl|wholeArt|badge|visited/i);
    expectNoPrivateOrRankingKeys(result);
  });
});

describe("suggest_walk", () => {
  const person = (slug: string) => PLACES.find((p) => p.slug === slug)!;
  const walkResult = (over: Partial<Extract<WalkResult, { ok: true }>> = {}): WalkResult => ({
    ok: true,
    start: { kind: "neighbourhood", neighbourhoodId: "shinchi", names: [] },
    stops: [
      {
        slug: "dejima-museum",
        names: person("dejima-museum").names,
        category: "museum",
        neighbourhoodId: "dejima",
        hasStory: true,
        confirmedAt: 1,
        wildCard: false,
        matchedInterests: ["history"],
        leg: { metres: 400, minutes: 5 },
      },
      {
        slug: "kamera-ya",
        names: person("kamera-ya").names,
        category: "shop",
        hasStory: false,
        confirmedAt: 2,
        wildCard: true,
        matchedInterests: [],
        leg: { metres: 120, minutes: 2 },
      },
      {
        slug: "oura-bar",
        names: person("oura-bar").names,
        category: "bar",
        hasStory: false,
        wildCard: false,
        matchedInterests: [],
        leg: { metres: 900, minutes: 11 },
      },
    ],
    rulesApplied: [
      {
        tag: "no-alcohol",
        checks: "leaves out bars and izakaya",
        limit: "Noren cannot tell whether a restaurant or café serves alcohol",
      },
    ],
    rulesNotChecked: [
      {
        tag: "vegetarian",
        reason: "Noren has no menu or ingredient data, so it cannot check this. Ask the place.",
      },
    ],
    interestsNotMatched: ["gardening"],
    ...over,
  });
  const run = async (input: Record<string, unknown>, walk = vi.fn(async () => walkResult())) => {
    const result = await suggestWalk.run(
      suggestWalk.inputSchema.parse(input),
      context(fakeData({ walk })),
    );
    return { result, walk };
  };

  it("says why each stop is there, and labels the wild card", async () => {
    const { result } = await run({ neighbourhood: "shinchi", interests: ["history", "gardening"] });
    const stops = ok(result).stops;
    expect(stops.map((s: any) => s.why)).toEqual([
      "Matches your interest in history",
      "Wild card — not picked for you",
      "Drawn at random from places near the start. It does not match your interests, which only tilt the odds",
    ]);
    expect(stops[1].wildCard).toBe(true);
    expect(WILD_CARD_WHY).toBe("Wild card — not picked for you");
    expect(whyStop({ wildCard: false, matchedInterests: [] }, false)).toBe(
      "Drawn at random from places near the start",
    );
    expect(whyStop({ wildCard: false, matchedInterests: ["history", "coffee"] }, true)).toBe(
      "Matches your interest in history and coffee",
    );
  });

  it("gives the walk between stops, from the start and then each stop", async () => {
    const stops = ok((await run({ neighbourhood: "Shinchi" })).result).stops;
    expect(stops[0].walkFromPrevious).toEqual({ from: "the start", minutes: 5, metres: 400 });
    expect(stops[1].walkFromPrevious).toEqual({
      from: "Dejima Museum (出島資料館)",
      minutes: 2,
      metres: 120,
    });
  });

  it("passes the rules on and says which it could not check", async () => {
    const result = ok(
      (await run({ neighbourhood: "shinchi", avoid: ["no-alcohol", "vegetarian"] })).result,
    );
    expect(result.rules.applied[0]).toMatchObject({ tag: "no-alcohol" });
    expect(result.rules.applied[0].what).toBe("Noren leaves out bars and izakaya.");
    expect(result.rules.notChecked).toEqual([
      {
        tag: "vegetarian",
        why: "Noren has no menu or ingredient data, so it cannot check this. Ask the place.",
      },
    ]);
    expect(result.notes.join(" ")).toMatch(/could not check/);
    expect(result.interestsNotMatched).toEqual(["gardening"]);
  });

  it("estimates walks from straight-line distance and says it is not a street route", async () => {
    const result = ok((await run({ neighbourhood: "shinchi" })).result);
    expect(result.notes.join(" ")).toMatch(/straight-line distance/);
    expect(result.notes.join(" ")).toMatch(/not a ranking|does not rank/i);
  });

  it("asks the draw for what was asked, with defaults, and never sends coordinates", async () => {
    const { walk } = await run({
      neighbourhood: "Dejima",
      avoid: ["cash-free"],
      interests: ["craft"],
      stops: 4,
      adventurousness: "surprise",
    });
    expect(walk).toHaveBeenCalledWith({
      start: { kind: "neighbourhood", id: "dejima" },
      count: 4,
      avoid: ["cash-free"],
      interests: ["craft"],
      adventurousness: "surprise",
    });
    const defaults = await run({ neighbourhood: "suwa" });
    expect(defaults.walk).toHaveBeenCalledWith({
      start: { kind: "neighbourhood", id: "suwa" },
      count: 3,
      avoid: [],
      interests: [],
      adventurousness: "mixed",
    });
    expect(JSON.stringify(walk.mock.calls)).not.toMatch(/lat|lng|coordinate/i);
  });

  it("starts from a place by its name or its slug", async () => {
    const byName = await run({ startPlace: "Dejima Museum" });
    expect(byName.walk).toHaveBeenCalledWith(
      expect.objectContaining({ start: { kind: "place", slug: "dejima-museum" } }),
    );
    const bySlug = await run({ startPlace: "oura-bar" });
    expect(bySlug.walk).toHaveBeenCalledWith(
      expect.objectContaining({ start: { kind: "place", slug: "oura-bar" } }),
    );
  });

  it("asks which place when a name could mean several", async () => {
    const two = [
      listed({ slug: "cafe-a", names: names("Sun Cafe", null) }),
      listed({ slug: "cafe-b", names: names("Sun Cafe Annex", null) }),
    ];
    const walk = vi.fn();
    const result = await suggestWalk.run(
      suggestWalk.inputSchema.parse({ startPlace: "sun" }),
      context(fakeData({ listPlaces: async () => two, walk })),
    );
    expect(failed(result)).toMatch(/could mean several places.*\[slug: cafe-a\].*\[slug: cafe-b\]/);
    expect(walk).not.toHaveBeenCalled();
  });

  it("needs exactly one start and rejects an unknown neighbourhood or place", async () => {
    expect(failed((await run({})).result)).toMatch(/exactly one/);
    expect(
      failed((await run({ neighbourhood: "suwa", startPlace: "Dejima Museum" })).result),
    ).toMatch(/exactly one/);
    expect(failed((await run({ neighbourhood: "atlantis" })).result)).toMatch(/Neighbourhood ids:/);
    expect(failed((await run({ startPlace: "No Such Place" })).result)).toMatch(
      /No public place is called/,
    );
  });

  it("refuses more than five stops or fewer than one", () => {
    expect(suggestWalk.inputSchema.safeParse({ neighbourhood: "suwa", stops: 6 }).success).toBe(
      false,
    );
    expect(suggestWalk.inputSchema.safeParse({ neighbourhood: "suwa", stops: 0 }).success).toBe(
      false,
    );
    expect(
      suggestWalk.inputSchema.safeParse({ neighbourhood: "suwa", adventurousness: "wild" }).success,
    ).toBe(false);
  });

  it("says when fewer places fit than were asked for", async () => {
    const short = walkResult({
      stops: walkResult().ok ? (walkResult() as any).stops.slice(0, 1) : [],
    });
    const { result } = await run(
      { neighbourhood: "shinchi", stops: 3 },
      vi.fn(async () => short),
    );
    expect(ok(result).notes.join(" ")).toMatch(/Only 1 place near the start fit/);
  });

  it("tells the assistant when Noren is busy", async () => {
    const busy = vi.fn(async () => {
      throw new ConnectorDataError("rate_limited", "slow down");
    });
    expect(failed((await run({ neighbourhood: "suwa" }, busy)).result)).toMatch(
      /try again in a minute/,
    );
  });

  it("returns no ranking, weight or private field", async () => {
    expectNoPrivateOrRankingKeys(ok((await run({ neighbourhood: "shinchi" })).result));
  });
});

describe("draw_omikuji", () => {
  const slip = (hasStory: boolean, neighbourhoodId: string | null = "suwa") =>
    vi.fn(async () => ({
      ok: true as const,
      day: "2026-11-10",
      ...(neighbourhoodId === null ? {} : { neighbourhoodId }),
      place: {
        slug: "kamera-ya",
        names: PLACES[2]!.names,
        category: "shop",
        confirmedAt: 2,
        hasStory,
      },
    }));
  const run = async (input: Record<string, unknown>, omikuji = slip(false)) => ({
    result: await drawOmikuji.run(
      drawOmikuji.inputSchema.parse(input),
      context(fakeData({ omikuji })),
    ),
    omikuji,
  });

  it("says nobody has written yet and links to the story form, from a template in both languages", async () => {
    const { result } = await run({ neighbourhood: "Suwa" });
    const out = ok(result);
    expect(out.slip.text).toEqual(SLIP_NO_STORY);
    expect(out.slip.text.en).toBe("Nobody has written about this one yet. Go in and be the first.");
    expect(out.slip.text.ja).toMatch(/まだ誰も書いていません/);
    expect(out.slip).toMatchObject({ date: "2026-11-10", area: { id: "suwa", en: "Suwa" } });
    expect(out.writeTheFirstStory).toBe(
      "https://noren.yooi.me/en/places/kamera-ya?tab=stories&write=1",
    );
    expect(out.place.url).toBe("https://noren.yooi.me/en/places/kamera-ya");
    expect(out.place.confirmation.confirmed).toBe(true);
  });

  it("changes the words, and drops the write link, when the place already has a story", async () => {
    const out = ok((await run({}, slip(true))).result);
    expect(out.slip.text).toEqual(SLIP_HAS_STORY);
    expect(out.writeTheFirstStory).toBeUndefined();
  });

  it("asks for the neighbourhood by id, and for the whole region when none is given", async () => {
    const { omikuji } = await run({ neighbourhood: "新地中華街" });
    expect(omikuji).toHaveBeenCalledWith({ neighbourhoodId: "shinchi" });
    const all = await run({}, slip(false, null));
    expect(all.omikuji).toHaveBeenCalledWith({});
    expect(ok(all.result).slip.area).toMatchObject({ en: "Nagasaki", ja: "長崎" });
  });

  it("rejects an unknown neighbourhood", async () => {
    expect(failed((await run({ neighbourhood: "atlantis" })).result)).toMatch(/Neighbourhood ids:/);
  });

  it("says so when the area has no public places to draw from", async () => {
    const empty = vi.fn(async () => ({ ok: false as const, reason: "no_places" as const }));
    expect(failed((await run({ neighbourhood: "suwa" }, empty as any)).result)).toMatch(
      /no public places/,
    );
  });

  it("is not a fortune with a grade: no ranking or score comes with the slip", async () => {
    const out = ok((await run({})).result);
    expectNoPrivateOrRankingKeys(out);
    expect(JSON.stringify(out)).not.toMatch(/大吉|中吉|小吉|凶|luck(y)? level/i);
  });
});
