/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addOwner,
  addPerson,
  addPlace,
  errorCode,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { runOmikuji, runOmikujiToday } from "./connector";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;

type Features = { connector: boolean; planner: boolean; walk: boolean };

/** As the region's file does once a feature is switched on. */
function switchOn(features: Partial<Features>) {
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, ...features } };
  });
}

beforeEach(() => switchOn({ walk: true }));
afterEach(() => vi.restoreAllMocks());

// 2026-11-10 12:00 in Japan.
const NOON = Date.UTC(2026, 10, 10, 3, 0, 0);
const SHINCHI = { lat: 32.7415, lng: 129.8755 };
const DEJIMA = { lat: 32.7437, lng: 129.8728 };

async function world() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const creator = await addPerson(b, "creator", "creator");
  const writer = await addPerson(b, "writer", "user");
  return { b, steward, creator, writer };
}

type Spec = {
  slug: string;
  lat?: number;
  lng?: number;
  visibility?: "draft" | "public" | "demo_public";
  isMock?: boolean;
  hidden?: boolean;
  confirmed?: boolean;
  category?: string;
};

async function place(b: Backend, creator: Id<"person">, spec: Spec): Promise<Id<"place">> {
  const placeId = await addPlace(b, {
    createdBy: creator,
    visibility: spec.visibility ?? "public",
    isMock: spec.isMock ?? false,
    category: spec.category ?? "cafe",
    slug: spec.slug,
  });
  await b.run(async (ctx) => {
    const pin = await ctx.db
      .query("pin")
      .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
      .unique();
    await ctx.db.patch("pin", pin!._id, {
      lat: spec.lat ?? SHINCHI.lat,
      lng: spec.lng ?? SHINCHI.lng,
    });
    if (spec.confirmed !== false) await ctx.db.patch("place", placeId, { confirmedAt: 1 });
    if (spec.hidden) {
      await ctx.db.patch("place", placeId, {
        visibility: "draft",
        hiddenReason: "not_for_visitors",
      });
    }
  });
  return placeId;
}

async function story(
  b: Backend,
  placeId: Id<"place">,
  writer: Id<"person">,
  body: string,
  over: { status?: "live" | "hidden"; lang?: string; isMock?: boolean } = {},
) {
  // Convex stamps the creation time itself; a pause keeps "newest" unambiguous.
  await new Promise((resolve) => setTimeout(resolve, 3));
  return await b.run((ctx) =>
    ctx.db.insert("story", {
      placeId,
      authorPersonId: writer,
      body,
      lang: over.lang ?? "en",
      status: over.status ?? "live",
      isMock: over.isMock ?? false,
    }),
  );
}

const forRegion = (b: Backend) => b.t.query(api.walk.forRegion, { regionId: "nagasaki" });

describe("walk.forRegion: the one download", () => {
  it("answers as if absent while the region's file keeps walk mode off", async () => {
    vi.restoreAllMocks();
    expect(realRegionConfig("nagasaki").features.walk).toBe(false);
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    expect(await errorCode(forRegion(b))).toBe("not_found");
  });

  it("is not switched on by the connector or the planner alone", async () => {
    vi.restoreAllMocks();
    switchOn({ connector: true, planner: true, walk: false });
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    expect(await errorCode(forRegion(b))).toBe("not_found");
  });

  it("lists the real places on the public map with a pin, and nothing a visitor cannot see", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "shop", confirmed: false });
    await place(b, creator, { slug: "confirmed-shop", lat: DEJIMA.lat, lng: DEJIMA.lng });
    await place(b, creator, { slug: "a-draft", visibility: "draft" });
    await place(b, creator, { slug: "taken-off", hidden: true });
    await place(b, creator, { slug: "demo", visibility: "demo_public", isMock: true });
    const places = await forRegion(b);
    expect(places.map((p) => p.slug).toSorted()).toEqual(["confirmed-shop", "shop"]);
    const shop = places.find((p) => p.slug === "shop")!;
    expect(shop).toMatchObject({
      pin: SHINCHI,
      confirmed: false,
      hasStory: false,
      category: "cafe",
    });
    expect(places.find((p) => p.slug === "confirmed-shop")!.confirmed).toBe(true);
    // No Convex id, score or count leaves with a place.
    expect(Object.keys(shop).toSorted()).toEqual([
      "category",
      "confirmed",
      "hasStory",
      "names",
      "pin",
      "slug",
    ]);
  });

  it("is the same for everyone: a steward's drafts do not come with it", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "public-one" });
    await place(b, creator, { slug: "a-draft", visibility: "draft" });
    const asSteward = await b.as("steward").query(api.walk.forRegion, { regionId: "nagasaki" });
    expect(asSteward).toEqual(await forRegion(b));
    expect(asSteward.map((p) => p.slug)).toEqual(["public-one"]);
  });

  it("takes the region and nothing else: a position cannot be passed in", async () => {
    const { b, creator } = await world();
    await place(b, creator, { slug: "one" });
    const withPosition = { regionId: "nagasaki", lat: SHINCHI.lat, lng: SHINCHI.lng } as never;
    expect(await errorCode(b.t.query(api.walk.forRegion, withPosition))).not.toBe("did not fail");
    const withNeighbourhood = { regionId: "nagasaki", neighbourhoodId: "shinchi" } as never;
    expect(await errorCode(b.t.query(api.walk.forRegion, withNeighbourhood))).not.toBe(
      "did not fail",
    );
  });
});

describe("walk.forRegion: what is read aloud", () => {
  it("gives the newest live member story, its first two sentences word for word, with the writer", async () => {
    const { b, creator, writer } = await world();
    const id = await place(b, creator, { slug: "cafe" });
    await story(b, id, writer, "An old story that is no longer the newest.");
    await story(
      b,
      id,
      writer,
      "The champon is just as it was.  My grandmother came here.\nWe sat by the window. Then it rained.",
    );
    await story(b, id, writer, "Hidden by its writer.", { status: "hidden" });
    const [cafe] = await forRegion(b);
    expect(cafe!.hasStory).toBe(true);
    expect(cafe!.snippet).toEqual({
      kind: "member",
      writer: "Test Person (writer)",
      lang: "en",
      text: "The champon is just as it was. My grandmother came here.",
      more: true,
    });
  });

  it("carries no ownership field: a verified owner's story looks like any visitor's", async () => {
    // The place page never says publicly that a story's writer runs the place, so walk mode must
    // not say it either, in the data or in the words.
    const { b, steward, creator, writer } = await world();
    const owner = await addPerson(b, "kenji", "user");
    const id = await place(b, creator, { slug: "kenjis" });
    await addOwner(b, id, owner, steward);
    await story(b, id, owner, "We open at six.");
    const other = await place(b, creator, { slug: "not-kenjis", lat: DEJIMA.lat, lng: DEJIMA.lng });
    await story(b, other, writer, "A visitor's story.");
    const places = await forRegion(b);
    const bySlug = Object.fromEntries(places.map((p) => [p.slug, p.snippet]));
    const keys = (snippet: unknown) => Object.keys(snippet as object).toSorted();
    expect(keys(bySlug["kenjis"])).toEqual(["kind", "lang", "more", "text", "writer"]);
    expect(keys(bySlug["not-kenjis"])).toEqual(keys(bySlug["kenjis"]));
    expect(bySlug["kenjis"]).toMatchObject({ kind: "member", text: "We open at six." });
    // Nowhere in the whole download: no ownership key, and no id of the owner or the place row.
    const everything = JSON.stringify(places);
    expect(everything).not.toMatch(/owner|runsPlace|runs it|placeOwner/i);
    expect(everything).not.toContain(owner);
    expect(everything).not.toContain(id);
  });

  it("does not read a demo account's story on a real place", async () => {
    const { b, creator } = await world();
    const demo = await addPerson(b, "demo-writer", "user", { isMock: true });
    const id = await place(b, creator, { slug: "real" });
    await story(b, id, demo, "A made-up story.", { isMock: true });
    const [real] = await forRegion(b);
    expect(real!.snippet).toBeUndefined();
  });

  it("keeps the writer's own language, so the phone picks a voice for it", async () => {
    const { b, creator, writer } = await world();
    const id = await place(b, creator, { slug: "ja-cafe" });
    await story(b, id, writer, "ちゃんぽんは昔のままです。祖母とよく来ました。窓際に座りました。", {
      lang: "ja",
    });
    const [cafe] = await forRegion(b);
    expect(cafe!.snippet).toMatchObject({
      kind: "member",
      lang: "ja",
      text: "ちゃんぽんは昔のままです。祖母とよく来ました。",
      more: true,
    });
  });

  async function foundPost(
    b: Backend,
    placeId: Id<"place">,
    addedBy: Id<"person">,
    over: Record<string, unknown> = {},
  ) {
    return await b.run((ctx) =>
      ctx.db.insert("source", {
        placeId,
        platform: "x",
        adapter: "x",
        url: "https://x.com/synthetic/status/1",
        canonicalUrl: "https://x.com/synthetic/status/1",
        authorHandle: "@synthetic",
        addedBy,
        status: "live",
        origin: "story_finder",
        foundKind: "story",
        excerpt: "ここのちゃんぽんは昔のまま。",
        excerptLang: "ja",
        sharedAt: 1,
        isMock: false,
        ...over,
      }),
    );
  }

  it("falls back to the story Noren's AI stitched, in both languages, with where it came from", async () => {
    const { b, steward, creator } = await world();
    const id = await place(b, creator, { slug: "stitched" });
    const post = await foundPost(b, id, steward);
    await b.run((ctx) =>
      ctx.db.insert("placeStory", {
        placeId: id,
        sentences: [
          {
            en: "One reviewer says the champon is unchanged.",
            ja: "ちゃんぽんは昔のままだそうです。",
            citations: [{ sourceId: post, words: "ここのちゃんぽんは昔のまま。" }],
          },
        ],
        postsRead: 3,
        writer: "test",
        checker: "test",
        publishedAt: 1,
      }),
    );
    const [stitched] = await forRegion(b);
    expect(stitched!.hasStory).toBe(true);
    expect(stitched!.snippet).toEqual({
      kind: "stitched",
      postsRead: 3,
      platforms: ["x"],
      sentences: [
        {
          en: "One reviewer says the champon is unchanged.",
          ja: "ちゃんぽんは昔のままだそうです。",
        },
      ],
    });
  });

  it("falls back to a found post's quote with its machine translations, never a tip or a card-less platform", async () => {
    const { b, steward, creator } = await world();
    const id = await place(b, creator, { slug: "quoted" });
    const post = await foundPost(b, id, steward);
    await b.run((ctx) =>
      ctx.db.insert("sourceExcerptTranslation", {
        sourceId: post,
        lang: "en",
        text: "The champon is just as it was.",
        sourceText: "ここのちゃんぽんは昔のまま。",
        origin: "machine",
        modelVersion: "test",
      }),
    );
    await foundPost(b, id, steward, {
      url: "https://x.com/synthetic/status/2",
      canonicalUrl: "https://x.com/synthetic/status/2",
      foundKind: "tip",
      excerpt: "A tip is not read aloud.",
      excerptLang: "en",
    });
    const cardless = await place(b, creator, {
      slug: "instagram-only",
      lat: DEJIMA.lat,
      lng: DEJIMA.lng,
    });
    await foundPost(b, cardless, steward, {
      platform: "instagram",
      adapter: "link_card",
      excerpt: "Words from a platform that gets no card.",
      excerptLang: "en",
    });
    const bySlug = Object.fromEntries((await forRegion(b)).map((p) => [p.slug, p]));
    expect(bySlug["quoted"]!.snippet).toEqual({
      kind: "post",
      platform: "x",
      author: "@synthetic",
      lang: "ja",
      text: "ここのちゃんぽんは昔のまま。",
      more: false,
      translations: [{ lang: "en", text: "The champon is just as it was." }],
    });
    expect(bySlug["instagram-only"]!.snippet).toBeUndefined();
  });

  it("marks a place that only has a member's shared post as having a story, with nothing to read", async () => {
    const { b, creator, writer } = await world();
    const id = await place(b, creator, { slug: "shared-only" });
    await b.run((ctx) =>
      ctx.db.insert("source", {
        placeId: id,
        platform: "test",
        adapter: "link_card",
        url: "https://example.com/post",
        canonicalUrl: "https://example.com/post",
        addedBy: writer,
        status: "live",
        sharedAt: 1,
        creatorNote: "A line about it",
        noteLang: "en",
        isMock: false,
      }),
    );
    const [shared] = await forRegion(b);
    expect(shared).toMatchObject({ slug: "shared-only", hasStory: true });
    expect(shared!.snippet).toBeUndefined();
  });
});

describe("omikujiToday: every neighbourhood's slip at once", () => {
  async function town() {
    const w = await world();
    const { b, creator, writer } = w;
    for (let i = 0; i < 8; i++) {
      const id = await place(b, creator, {
        slug: `shinchi-${i}`,
        lat: SHINCHI.lat + (i % 4) * 0.0003,
        lng: SHINCHI.lng + Math.floor(i / 4) * 0.0003,
      });
      if (i < 4) await story(b, id, writer, "A story.");
    }
    await place(b, creator, { slug: "dejima-0", lat: DEJIMA.lat, lng: DEJIMA.lng });
    await place(b, creator, { slug: "dejima-1", lat: 32.7439, lng: 129.8729 });
    await place(b, creator, { slug: "far-away", lat: 32.9, lng: 130.1 });
    return w;
  }
  const today = (b: Backend, now = NOON) =>
    b.run((ctx) => runOmikujiToday(ctx, { regionId: "nagasaki" }, now));

  it("matches, for every neighbourhood and for the whole region, the slip the connector gives", async () => {
    const { b } = await town();
    const all = await today(b);
    expect(all.day).toBe("2026-11-10");
    const neighbourhoods = realRegionConfig("nagasaki").neighbourhoods!.map(({ id }) => id);
    for (const id of neighbourhoods) {
      const connector = await b.run((ctx) =>
        runOmikuji(ctx, { regionId: "nagasaki", neighbourhoodId: id }, NOON),
      );
      const slip = all.slips.find((candidate) => candidate.neighbourhoodId === id);
      if (connector.ok) expect(slip?.place.slug).toBe(connector.place.slug);
      else expect(slip).toBeUndefined();
    }
    const region_ = await b.run((ctx) => runOmikuji(ctx, { regionId: "nagasaki" }, NOON));
    if (!region_.ok) throw new Error("no region slip");
    expect(all.slips.find((slip) => slip.neighbourhoodId === undefined)?.place.slug).toBe(
      region_.place.slug,
    );
    // Shinchi and Dejima have places, so they have slips; the far-away place is only in the region's.
    expect(all.slips.find((s) => s.neighbourhoodId === "shinchi")).toBeDefined();
    expect(all.slips.find((s) => s.neighbourhoodId === "dejima")).toBeDefined();
    expect(all.slips.find((s) => s.neighbourhoodId === "teramachi")).toBeUndefined();
  });

  it("is the slip anyone gets all day, and the public draw agrees", async () => {
    const { b } = await town();
    const morning = await today(b, NOON - 3 * 3_600_000);
    const evening = await today(b, NOON + 5 * 3_600_000);
    expect(evening).toEqual(morning);
    const viaApi = await b.t.mutation(api.connector.omikujiToday, { regionId: "nagasaki" });
    expect(viaApi.slips.map((s) => [s.neighbourhoodId, s.place.slug])).toEqual(
      (await today(b, Date.now())).slips.map((s) => [s.neighbourhoodId, s.place.slug]),
    );
    const shinchi = await b.t.mutation(api.connector.omikuji, {
      regionId: "nagasaki",
      neighbourhoodId: "shinchi",
    });
    expect(shinchi.ok && shinchi.place.slug).toBe(
      viaApi.slips.find((s) => s.neighbourhoodId === "shinchi")?.place.slug,
    );
  });

  it("gives the phone the pin, never an id, and lets it work out the rest", async () => {
    const { b } = await town();
    const { slips } = await today(b);
    for (const slip of slips) {
      expect(Object.keys(slip.place).toSorted()).toEqual(
        // neighbourhoodId is the one the place is in, which is public data about the place.
        ["category", "confirmedAt", "hasStory", "names", "neighbourhoodId", "pin", "slug"].filter(
          (key) => key in slip.place,
        ),
      );
      expect(slip.place.pin.lat).toBeTypeOf("number");
    }
  });

  it("records no exposure: the ledger would have to learn which slip the person took", async () => {
    const { b } = await town();
    await today(b);
    expect(await b.t.run((ctx) => ctx.db.query("placeExposure").take(1))).toEqual([]);
  });

  it("counts as one draw against the shared limit and is keyed by nothing about the caller", async () => {
    const { b } = await town();
    await today(b);
    const rows = await b.t.run((ctx) => ctx.db.query("rateLimit").take(10));
    expect(rows.map((row) => [row.key, row.count]).toSorted()).toEqual([
      ["connector:draw:hour", 1],
      ["connector:draw:minute", 1],
    ]);
  });

  it("takes the region and nothing else: no position and no neighbourhood", async () => {
    const { b } = await town();
    const withNeighbourhood = { regionId: "nagasaki", neighbourhoodId: "shinchi" } as never;
    expect(await errorCode(b.t.mutation(api.connector.omikujiToday, withNeighbourhood))).not.toBe(
      "did not fail",
    );
    const withPosition = { regionId: "nagasaki", lat: 1, lng: 2 } as never;
    expect(await errorCode(b.t.mutation(api.connector.omikujiToday, withPosition))).not.toBe(
      "did not fail",
    );
  });

  it("answers while any draw-using feature is on, and as if absent while all are off", async () => {
    const { b } = await town();
    vi.restoreAllMocks();
    expect(
      await errorCode(b.t.mutation(api.connector.omikujiToday, { regionId: "nagasaki" })),
    ).toBe("not_found");
    switchOn({ planner: true });
    expect(
      await errorCode(b.t.mutation(api.connector.omikujiToday, { regionId: "nagasaki" })),
    ).toBe("did not fail");
  });
});
