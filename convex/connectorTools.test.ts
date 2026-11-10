/* eslint-disable @typescript-eslint/no-explicit-any -- tool results are JSON, read here by key */
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nagasaki from "../regions/nagasaki.json";
import { convexConnectorData } from "../src/lib/connector/convex-data";
import { CONNECTOR_DEFAULTS } from "../src/lib/connector/policy";
import {
  drawOmikuji,
  getPlace,
  listCollections,
  searchPlaces,
  suggestWalk,
  type ToolResult,
} from "../src/lib/connector/tools";
import type { ToolContext } from "../src/lib/connector/types";
import { regionSchema } from "../src/lib/region/schema";
import {
  addClaim,
  addPage,
  addPerson,
  addPlace,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
import type { Id } from "./_generated/dataModel";
import * as regionModule from "./lib/region";

// The real tools and the real data layer, reading the real Convex public functions in convex-test,
// signed out. This is the check that nothing a signed-out visitor cannot see comes through.

const holder = vi.hoisted(() => ({
  t: null as null | {
    query: (ref: unknown, args: unknown) => Promise<unknown>;
    mutation: (ref: unknown, args: unknown) => Promise<unknown>;
  },
  tokens: [] as unknown[],
}));
vi.mock("convex/nextjs", () => ({
  fetchQuery: (ref: unknown, args: unknown, options?: unknown) => {
    holder.tokens.push(options);
    return holder.t!.query(ref, args);
  },
  fetchMutation: (ref: unknown, args: unknown, options?: unknown) => {
    holder.tokens.push(options);
    return holder.t!.mutation(ref, args);
  },
}));

const modules = import.meta.glob("./**/*.ts");
const region = regionSchema.parse(nagasaki);
const NOW = Date.UTC(2026, 10, 10, 3, 0, 0);

function ok(result: ToolResult): Record<string, any> {
  if (!result.ok) throw new Error(`expected a result, got: ${result.message}`);
  return result.result as Record<string, any>;
}

async function setup() {
  const b = newBackend(modules);
  holder.t = b.t as never;
  const creator = await addPerson(b, "creator", "creator");
  const steward = await addPerson(b, "steward", "steward");
  const writerA = await addPerson(b, "writer-a", "user");
  const writerB = await addPerson(b, "writer-b", "user");
  const context = (options = CONNECTOR_DEFAULTS): ToolContext => ({
    data: convexConnectorData("nagasaki"),
    region,
    origin: "https://noren.yooi.me",
    options,
    now: () => NOW,
  });
  return { b, creator, steward, writerA, writerB, context };
}

async function publicPlace(b: Backend, creator: Id<"person">, slug: string, over = {}) {
  return await addPlace(b, {
    createdBy: creator,
    visibility: "public",
    isMock: false,
    category: "cafe",
    slug,
    ...over,
  });
}

const realRegionConfig = regionModule.regionConfig;

beforeEach(() => {
  holder.tokens = [];
  // As the region's file does once the connector is switched on; the draws refuse while it is off.
  vi.spyOn(regionModule, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, connector: true } };
  });
});
afterEach(() => vi.restoreAllMocks());

/** As a region does once its launch pack is complete: real places show their owners' statements. */
function completeLaunchPack() {
  vi.spyOn(regionModule, "regionPolicy").mockReturnValue({
    ...regionModule.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
}

describe("get_place reads exactly what a signed-out visitor sees", () => {
  it("returns every layer of a public page, with the opt-in deciding whose story text goes out", async () => {
    completeLaunchPack();
    const { b, creator, steward, writerA, writerB, context } = await setup();
    const placeId = await publicPlace(b, creator, "hill-cafe");
    const now = Date.now();
    await b.run(async (ctx) => {
      await ctx.db.insert("story", {
        placeId,
        authorPersonId: writerA,
        body: "Allowed story words.",
        lang: "en",
        status: "live",
        isMock: false,
        connectorAllowedAt: now,
      });
      await ctx.db.insert("story", {
        placeId,
        authorPersonId: writerB,
        body: "Private story words.",
        lang: "en",
        status: "live",
        isMock: false,
      });
      // A story that was taken down, and a story by a demo account, are not on the page.
      await ctx.db.insert("story", {
        placeId,
        authorPersonId: writerB,
        body: "Removed words.",
        lang: "en",
        status: "hidden",
        isMock: false,
        connectorAllowedAt: now,
      });
    });
    const claim = await addClaim(b, {
      placeId,
      kind: "story",
      origin: "creator_note",
      status: "published",
      authorId: creator,
      text: "祖父が始めた店です。",
    });
    await addClaim(b, {
      placeId,
      kind: "caution",
      cautionType: "cash_only",
      origin: "creator_note",
      status: "published",
      authorId: creator,
      text: "現金のみ",
    });
    await b.run((ctx) =>
      ctx.db.insert("claimTranslation", {
        claimId: claim,
        lang: "en",
        text: "My grandfather started the shop.",
        origin: "machine",
      }),
    );
    await addPage(b, {
      placeId,
      sentences: [{ lang: "ja", text: "祖父が始めた店です。", claimIds: [claim] }],
    });
    // A found public post and the story Noren's AI stitched from it.
    const foundId = await b.run((ctx) =>
      ctx.db.insert("source", {
        placeId,
        platform: "x",
        adapter: "x",
        url: "https://x.com/synthetic/status/1",
        canonicalUrl: "https://x.com/synthetic/status/1",
        authorHandle: "@synthetic",
        addedBy: steward,
        status: "live",
        origin: "story_finder",
        foundKind: "story",
        excerpt: "ここのちゃんぽんは昔のまま。",
        excerptLang: "ja",
        sharedAt: now,
        isMock: false,
      }),
    );
    await b.run((ctx) =>
      ctx.db.insert("sourceExcerptTranslation", {
        sourceId: foundId,
        lang: "en",
        text: "The champon is just as it was.",
        sourceText: "ここのちゃんぽんは昔のまま。",
        origin: "machine",
        modelVersion: "test",
      }),
    );
    await b.run((ctx) =>
      ctx.db.insert("placeStory", {
        placeId,
        sentences: [
          {
            en: "One reviewer says the champon is unchanged.",
            ja: "ちゃんぽんは昔のままだそうです。",
            citations: [{ sourceId: foundId, words: "ここのちゃんぽんは昔のまま。" }],
          },
        ],
        postsRead: 1,
        writer: "test",
        checker: "test",
        publishedAt: now,
      }),
    );

    const result = ok(
      await getPlace.run(getPlace.inputSchema.parse({ slug: "hill-cafe" }), context()),
    );

    // Member stories: only the allowed one, by name; the other is a count and a link.
    expect(result.memberStories.stories.map((s: any) => [s.writer, s.text])).toEqual([
      ["Test Person (writer-a)", "Allowed story words."],
    ]);
    expect(result.memberStories.total).toBe(2);
    expect(result.memberStories.heldBack).toBe(1);
    expect(result.memberStories.readOnNoren).toBe(
      "Read the member stories on Noren: https://noren.yooi.me/en/places/hill-cafe",
    );
    const text = JSON.stringify(result);
    expect(text).not.toContain("Private story words");
    expect(text).not.toContain("writer-b");
    expect(text).not.toContain("Removed words");
    // The owner's page: a caution with its fixed label, a statement with a labelled translation.
    expect(result.cautions[0]).toMatchObject({ key: "cash_only", label: { en: "Cash only" } });
    expect(result.ownerStatements[0].translations).toEqual([
      { language: "en", text: "My grandfather started the shop.", label: "Machine translation" },
    ]);
    // The found post and the AI's story, labelled as the page labels them.
    expect(result.foundPosts[0]).toMatchObject({
      quote: "ここのちゃんぽんは昔のまま。",
      author: "@synthetic",
      link: "https://x.com/synthetic/status/1",
      translations: [{ label: "Machine translation", text: "The champon is just as it was." }],
    });
    expect(result.stitchedStory.label.en).toMatch(/^Stitched by Noren's AI/);
    expect(result.stitchedStory.sources[0]).toMatchObject({
      number: 1,
      link: "https://x.com/synthetic/status/1",
    });
    expect(result.place.url).toBe("https://noren.yooi.me/en/places/hill-cafe");

    // For Noren's own planner, every story the page shows.
    const inApp = ok(
      await getPlace.run(
        getPlace.inputSchema.parse({ slug: "hill-cafe" }),
        context({ memberStories: "all-shown" }),
      ),
    );
    expect(inApp.memberStories.stories.map((s: any) => s.text).toSorted()).toEqual([
      "Allowed story words.",
      "Private story words.",
    ]);
  });

  it("shows none of a real place's owner statements before the launch pack is complete, as its page does", async () => {
    const { b, creator, context } = await setup();
    const placeId = await publicPlace(b, creator, "hill-cafe");
    const claim = await addClaim(b, {
      placeId,
      kind: "story",
      origin: "creator_note",
      status: "published",
      authorId: creator,
      text: "祖父が始めた店です。",
    });
    await addClaim(b, {
      placeId,
      kind: "caution",
      cautionType: "cash_only",
      origin: "creator_note",
      status: "published",
      authorId: creator,
      text: "現金のみ",
    });
    await addPage(b, {
      placeId,
      sentences: [{ lang: "ja", text: "祖父が始めた店です。", claimIds: [claim] }],
    });
    const result = ok(
      await getPlace.run(getPlace.inputSchema.parse({ slug: "hill-cafe" }), context()),
    );
    expect(result.cautions).toEqual([]);
    expect(result.ownerStatements).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("祖父");
  });

  it("finds nothing for a draft, a place waiting for a steward or a place taken off the map", async () => {
    const { b, creator, context } = await setup();
    await publicPlace(b, creator, "a-draft", { visibility: "draft" });
    const hidden = await publicPlace(b, creator, "taken-off");
    await b.run((ctx) =>
      ctx.db.patch("place", hidden, { visibility: "draft", hiddenReason: "reported" }),
    );
    await publicPlace(b, creator, "waiting", { visibility: "draft" });
    await b.run(async (ctx) => {
      const place = await ctx.db
        .query("place")
        .withIndex("by_regionId_and_slug", (q) =>
          q.eq("regionId", "nagasaki").eq("slug", "waiting"),
        )
        .unique();
      await ctx.db.patch("place", place!._id, { awaitingSteward: true });
    });
    for (const slug of ["a-draft", "taken-off", "waiting", "no-such-place"]) {
      const result = await getPlace.run(getPlace.inputSchema.parse({ slug }), context());
      expect(result.ok, slug).toBe(false);
    }
    const found = ok(
      await searchPlaces.run(searchPlaces.inputSchema.parse({ category: "cafe" }), context()),
    );
    expect(found.places).toEqual([]);
  });

  it("returns a pilot place to no one, because there is no signed-in visitor", async () => {
    const { b, creator, context } = await setup();
    const id = await publicPlace(b, creator, "pilot-place");
    await b.t.run((ctx) => ctx.db.patch("place", id, { visibility: "pilot" }));
    expect(
      (await getPlace.run(getPlace.inputSchema.parse({ slug: "pilot-place" }), context())).ok,
    ).toBe(false);
  });

  it("marks a demo place and its story as Demo", async () => {
    const { b, creator, writerA, context } = await setup();
    const demoId = await addPlace(b, {
      createdBy: creator,
      visibility: "demo_public",
      isMock: true,
      category: "cafe",
      slug: "demo-cafe",
    });
    await b.run((ctx) =>
      ctx.db.insert("story", {
        placeId: demoId,
        authorPersonId: writerA,
        body: "Made-up words.",
        lang: "en",
        status: "live",
        isMock: true,
        connectorAllowedAt: Date.now(),
      }),
    );
    const result = ok(
      await getPlace.run(getPlace.inputSchema.parse({ slug: "demo-cafe" }), context()),
    );
    expect(result.place.demo).toBe("Demo");
    expect(result.memberStories.stories[0].demo).toBe("Demo");
  });

  it("never sends a token, so Convex sees no person", async () => {
    const { b, creator, context } = await setup();
    await publicPlace(b, creator, "hill-cafe");
    await getPlace.run(getPlace.inputSchema.parse({ slug: "hill-cafe" }), context());
    await searchPlaces.run(searchPlaces.inputSchema.parse({ query: "test" }), context());
    await suggestWalk.run(suggestWalk.inputSchema.parse({ neighbourhood: "suwa" }), context());
    expect(holder.tokens.length).toBeGreaterThan(5);
    expect(holder.tokens.every((options) => options === undefined)).toBe(true);
  });
});

describe("search, collections, walk and omikuji end to end", () => {
  it("searches the public map, with the not-yet-confirmed label and links", async () => {
    const { b, creator, context } = await setup();
    await publicPlace(b, creator, "alpha-cafe", { category: "cafe" });
    const result = ok(
      await searchPlaces.run(searchPlaces.inputSchema.parse({ query: "テスト" }), context()),
    );
    expect(result.places[0]).toMatchObject({
      slug: "alpha-cafe",
      name: "Test Shop (テスト店)",
      confirmation: { confirmed: false, label: "Not yet confirmed" },
      url: "https://noren.yooi.me/en/places/alpha-cafe",
    });
  });

  it("lists the live stamp sets with their public places and no one's progress", async () => {
    const { b, creator, context } = await setup();
    const inSet = await publicPlace(b, creator, "in-the-set");
    await publicPlace(b, creator, "not-in-the-set");
    await b.run(async (ctx) => {
      const live = await ctx.db.insert("collectionSet", {
        regionId: "nagasaki",
        neighbourhoodId: "shinchi",
        names: { en: "Shinchi", ja: "新地中華街" },
        panelCount: 6,
        status: "live",
      });
      const draft = await ctx.db.insert("collectionSet", {
        regionId: "nagasaki",
        neighbourhoodId: "dejima",
        names: { en: "Dejima", ja: "出島" },
        panelCount: 6,
        status: "draft",
      });
      await ctx.db.insert("collectionPanel", { setId: live, index: 0 });
      await ctx.db.insert("collectionPlace", { setId: live, panelIndex: 0, placeId: inSet });
      await ctx.db.insert("collectionPanel", { setId: draft, index: 0 });
    });
    const result = ok(await listCollections.run(listCollections.inputSchema.parse({}), context()));
    expect(result.collections).toHaveLength(1);
    expect(result.collections[0]).toMatchObject({
      id: "shinchi",
      name: { en: "Shinchi", ja: "新地中華街" },
      url: "https://noren.yooi.me/en/collection/shinchi",
    });
    expect(result.collections[0].places.map((p: any) => p.slug)).toEqual(["in-the-set"]);
    expect(JSON.stringify(result)).not.toMatch(/dyed|finished|artUrl|wholeArt|badge|visited/i);
  });

  it("suggests a walk by neighbourhood, records the turns, and starts from a place by name", async () => {
    const { b, creator, context } = await setup();
    for (const [i, slug] of ["a", "b", "c", "d"].entries()) {
      const id = await publicPlace(b, creator, slug);
      await b.run(async (ctx) => {
        const pin = await ctx.db
          .query("pin")
          .withIndex("by_placeId", (q) => q.eq("placeId", id))
          .unique();
        await ctx.db.patch("pin", pin!._id, { lat: 32.7415 + i * 0.001, lng: 129.8755 });
      });
    }
    const walk = ok(
      await suggestWalk.run(
        suggestWalk.inputSchema.parse({
          neighbourhood: "Shinchi",
          stops: 3,
          adventurousness: "mixed",
        }),
        context(),
      ),
    );
    expect(walk.stops).toHaveLength(3);
    expect(walk.stops.filter((s: any) => s.why === "Wild card — not picked for you")).toHaveLength(
      1,
    );
    expect(walk.stops.every((s: any) => s.url.startsWith("https://noren.yooi.me/en/places/"))).toBe(
      true,
    );
    expect((await b.t.run((ctx) => ctx.db.query("placeExposure").take(10))).length).toBe(3);

    const fromPlace = ok(
      await suggestWalk.run(
        suggestWalk.inputSchema.parse({ startPlace: "a", stops: 2 }),
        context(),
      ),
    );
    expect(fromPlace.start).toMatchObject({
      kind: "place",
      url: "https://noren.yooi.me/en/places/a",
    });
    expect(fromPlace.stops.map((s: any) => s.slug)).not.toContain("a");
  });

  it("draws the same omikuji twice and offers the link to write the first story", async () => {
    const { b, creator, context } = await setup();
    await publicPlace(b, creator, "only-one");
    const first = ok(await drawOmikuji.run(drawOmikuji.inputSchema.parse({}), context()));
    const second = ok(await drawOmikuji.run(drawOmikuji.inputSchema.parse({}), context()));
    expect(second.place.slug).toBe(first.place.slug);
    expect(first.slip.text.en).toBe(
      "Nobody has written about this one yet. Go in and be the first.",
    );
    expect(first.writeTheFirstStory).toBe(
      "https://noren.yooi.me/en/places/only-one?tab=stories&write=1",
    );
  });

  it("tells the assistant when the draws are rate limited", async () => {
    const { b, creator, context } = await setup();
    await publicPlace(b, creator, "only-one");
    for (let i = 0; i < 60; i++)
      await drawOmikuji.run(drawOmikuji.inputSchema.parse({}), context());
    const refused = await drawOmikuji.run(drawOmikuji.inputSchema.parse({}), context());
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toMatch(/try again in a minute/);
  });
});
