/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addPerson, addPlace, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import collectionSource from "./collection.ts?raw";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
});
afterEach(() => vi.restoreAllMocks());

const WHERE = { regionId: "nagasaki", neighbourhoodId: "shinchi" };
const SHINCHI = { ja: "新地中華街", en: "Shinchi" };
const SLUGS = ["one", "two", "three", "four", "five", "six"];

async function member(b: Backend, name: string, options: { isMock?: boolean } = {}) {
  const id = await addPerson(b, name, "user", options);
  await b.as(name).mutation(api.people.ensureCurrent, {});
  return id;
}

/** A live set with six panels of one place each, and a second place on the last panel. */
async function setup(options: { live?: boolean } = {}) {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const hana = await member(b, "hana");
  const kenta = await member(b, "kenta");
  const places: Record<string, Id<"place">> = {};
  for (const slug of [...SLUGS, "six-b", "spare"]) {
    places[slug] = await addPlace(b, { createdBy: steward, visibility: "public", slug });
    await b.run((ctx) =>
      ctx.db.patch("place", places[slug]!, {
        neighbourhood: "shinchi",
        mapPin: { lat: 32.7415, lng: 129.8755 },
      }),
    );
  }
  const setId = await b.t.mutation(internal.collection.createSet, {
    ...WHERE,
    names: SHINCHI,
    panels: [["one"], ["two"], ["three"], ["four"], ["five"], ["six", "six-b"]],
  });
  for (const panelIndex of [null, 0, 1, 2, 3, 4, 5]) {
    const storageId = await b.run((ctx) => ctx.storage.store(new Blob([`art ${panelIndex}`])));
    await b.t.mutation(internal.collection.attachArt, { ...WHERE, panelIndex, storageId });
  }
  if (options.live ?? true) {
    await b.as("steward").mutation(api.collection.setStatus, { setId, status: "live" });
  }
  const check = (name: string, slug: string) =>
    b.as(name).mutation(api.collection.checkIn, { placeId: places[slug]! });
  const rowOf = (personId: Id<"person">) =>
    b.run((ctx) =>
      ctx.db
        .query("personCollection")
        .withIndex("by_personId", (q) => q.eq("personId", personId))
        .unique(),
    );
  return { b, steward, hana, kenta, places, setId, check, rowOf };
}

async function addStory(
  b: Backend,
  placeId: Id<"place">,
  createdBy: Id<"person">,
  lines: readonly string[],
) {
  return await b.run(async (ctx) => {
    const url = "https://example.test/post";
    const sourceId = await ctx.db.insert("source", {
      placeId,
      adapter: "website",
      platform: "blog",
      url,
      canonicalUrl: url,
      status: "live",
      addedBy: createdBy,
      isMock: false,
      origin: "story_finder",
      sharedAt: 1,
      excerpt: "the words",
      excerptLang: "en",
    });
    const storyId = await ctx.db.insert("placeStory", {
      placeId,
      postsRead: 4,
      sentences: lines.map((en) => ({
        en,
        ja: `${en}（日本語）`,
        citations: [{ sourceId, words: "the words" }],
      })),
      writer: "test",
      checker: "test",
      publishedAt: 1,
    });
    return { sourceId, storyId };
  });
}

describe("collection.checkIn", () => {
  it("dyes the place's fixed panel, every time and for everyone", async () => {
    const { check } = await setup();
    expect(await check("hana", "three")).toMatchObject({
      outcome: "dyed",
      panelIndex: 2,
      dyedCount: 1,
      panelCount: 6,
      finished: false,
    });
    expect(await check("kenta", "three")).toMatchObject({ outcome: "dyed", panelIndex: 2 });
  });

  it("adds nothing on a repeat visit", async () => {
    const { check, rowOf, hana } = await setup();
    await check("hana", "one");
    const first = await rowOf(hana);
    expect(await check("hana", "one")).toMatchObject({ outcome: "already_here", dyedCount: 1 });
    expect((await rowOf(hana))?.visits).toEqual(first?.visits);
  });

  it("adds the visit but not a panel at a second place on the same panel", async () => {
    const { check, rowOf, hana } = await setup();
    await check("hana", "six");
    expect(await check("hana", "six-b")).toMatchObject({
      outcome: "already_dyed",
      panelIndex: 5,
      dyedCount: 1,
    });
    expect((await rowOf(hana))?.visits).toHaveLength(2);
  });

  it("stores the place, set, panel and date, and nothing else", async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 5, 15, 30) });
    try {
      const { check, rowOf, hana, places, setId } = await setup();
      await check("hana", "two");
      expect((await rowOf(hana))?.visits).toEqual([
        { placeId: places.two, setId, panelIndex: 1, day: "2026-11-06" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("takes no coordinates", async () => {
    const { b, places } = await setup();
    const sent = b.as("hana").mutation(api.collection.checkIn, {
      placeId: places.one!,
      lat: 32.7,
    } as never);
    await expect(sent).rejects.toThrow();
  });

  it("writes no audit entry, because one would carry the time of day", async () => {
    const { b, check } = await setup();
    const count = () => b.run(async (ctx) => (await ctx.db.query("auditLog").take(1000)).length);
    const before = await count();
    await check("hana", "one");
    expect(await count()).toBe(before);
  });

  it("makes no row of its own, so a row's creation time can't show when someone came", async () => {
    const { b, places, check } = await setup();
    await addPerson(b, "noRow", "user");
    expect(await errorCode(check("noRow", "one"))).toBe("conflict");
    expect(
      await b.run(async (ctx) => (await ctx.db.query("personCollection").take(10)).length),
    ).toBe(2);
    expect(places.one).toBeDefined();
  });

  it("refuses a signed-out caller, a place outside a live set and a demo account", async () => {
    const { b, places, check } = await setup();
    expect(await errorCode(b.t.mutation(api.collection.checkIn, { placeId: places.one! }))).toBe(
      "unauthenticated",
    );
    expect(await errorCode(check("hana", "spare"))).toBe("not_found");
    await member(b, "demo", { isMock: true });
    expect(await errorCode(check("demo", "one"))).toBe("forbidden");
  });

  it("refuses every place while the set is a draft", async () => {
    const { check } = await setup({ live: false });
    expect(await errorCode(check("hana", "one"))).toBe("not_found");
  });
});

describe("what a person can see", () => {
  it("sends no art for an undyed panel, for another person or when signed out", async () => {
    const { b, check } = await setup();
    await check("hana", "one");
    const panels = async (reader: ReturnType<Backend["as"]> | Backend["t"]) =>
      (await reader.query(api.collection.set, WHERE))!.panels;

    const mine = await panels(b.as("hana"));
    expect(mine[0]).toMatchObject({ dyed: true, artUrl: expect.any(String) });
    expect(mine.slice(1).every(({ dyed, artUrl }) => !dyed && artUrl === null)).toBe(true);

    for (const other of [await panels(b.as("kenta")), await panels(b.t)]) {
      expect(other.every(({ dyed, artUrl }) => !dyed && artUrl === null)).toBe(true);
    }
  });

  it("keeps the whole picture back until every panel is dyed", async () => {
    const { b, check } = await setup();
    for (const slug of SLUGS.slice(0, 5)) await check("hana", slug);
    const nearly = await b.as("hana").query(api.collection.set, WHERE);
    expect(nearly).toMatchObject({ finished: false, wholeArtUrl: null, finishedOn: null });
    await check("hana", "six");
    const done = await b.as("hana").query(api.collection.set, WHERE);
    expect(done).toMatchObject({ finished: true, wholeArtUrl: expect.any(String) });
    expect((await b.as("kenta").query(api.collection.set, WHERE))?.wholeArtUrl).toBeNull();
  });

  it("shows a second person none of the first person's progress", async () => {
    const { b, check, places } = await setup();
    await check("hana", "one");
    const book = await b.as("kenta").query(api.collection.book, { regionId: "nagasaki" });
    expect(book.sets[0]?.dyedCount).toBe(0);
    expect(book.badges).toEqual([]);
    expect(
      await b.as("kenta").query(api.collection.forPlace, { placeId: places.one! }),
    ).toMatchObject({ visited: false, panelDyed: false, dyedPanels: [] });
    expect((await b.as("kenta").query(api.collection.set, WHERE))?.lastVisitedPlaceId).toBeNull();
  });

  it("shows anyone the set and its places with nothing dyed", async () => {
    const { b, places } = await setup();
    const book = await b.t.query(api.collection.book, { regionId: "nagasaki" });
    expect(book.sets[0]).toMatchObject({ neighbourhoodId: "shinchi", dyedCount: 0, panelCount: 6 });
    const set = await b.t.query(api.collection.set, WHERE);
    expect(set?.panels[0]?.places[0]).toMatchObject({ placeId: places.one, slug: "one" });
    expect(set?.panels[5]?.places).toHaveLength(2);
    expect(await b.t.query(api.collection.forPlace, { placeId: places.one! })).toMatchObject({
      panelIndex: 0,
      panelCount: 6,
      visited: false,
    });
  });

  it("hides a draft set from everyone except a steward", async () => {
    const { b, places } = await setup({ live: false });
    expect(await b.t.query(api.collection.set, WHERE)).toBeNull();
    expect(await b.as("hana").query(api.collection.set, WHERE)).toBeNull();
    expect(await b.as("steward").query(api.collection.set, WHERE)).not.toBeNull();
    expect(await b.t.query(api.collection.forPlace, { placeId: places.one! })).toBeNull();
    expect((await b.t.query(api.collection.book, { regionId: "nagasaki" })).sets).toEqual([]);
  });

  it("leaves out a place the caller can no longer read", async () => {
    const { b, places } = await setup();
    await b.run((ctx) => ctx.db.patch("place", places.one!, { visibility: "draft" }));
    expect((await b.t.query(api.collection.set, WHERE))?.panels[0]?.places).toEqual([]);
  });

  it("takes no person as an argument anywhere", () => {
    expect(collectionSource).not.toContain('v.id("person")');
  });
});

describe("finishing a set", () => {
  async function finish(context: Awaited<ReturnType<typeof setup>>, name = "hana") {
    for (const slug of SLUGS) await context.check(name, slug);
  }

  it("adds one dated badge with the last panel", async () => {
    const context = await setup();
    const { check, rowOf, hana } = context;
    for (const slug of SLUGS.slice(0, 5)) await check("hana", slug);
    expect((await rowOf(hana))?.badges).toEqual([]);
    expect(await check("hana", "six")).toMatchObject({ outcome: "dyed", finished: true });
    expect(await check("hana", "six-b")).toMatchObject({ outcome: "already_dyed", finished: true });
    const badges = (await rowOf(hana))?.badges;
    expect(badges).toHaveLength(1);
    expect(badges?.[0]).toMatchObject({
      names: SHINCHI,
      finishedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("keeps the badge and its picture after a swap or a move back to draft", async () => {
    const context = await setup();
    const { b, places, setId } = context;
    await finish(context);
    await b.as("steward").mutation(api.collection.swapPlace, {
      setId,
      panelIndex: 0,
      removePlaceId: places.one,
      addPlaceId: places.spare,
    });
    await b.as("steward").mutation(api.collection.setStatus, { setId, status: "draft" });
    const book = await b.as("hana").query(api.collection.book, { regionId: "nagasaki" });
    expect(book.badges[0]).toMatchObject({
      setId,
      names: SHINCHI,
      wholeArtUrl: expect.any(String),
    });
  });

  it("lets someone who visited a place fill the panel it moves to", async () => {
    const context = await setup();
    const { b, check, places, setId } = context;
    await check("hana", "one");
    await b.as("steward").mutation(api.collection.swapPlace, {
      setId,
      panelIndex: 0,
      removePlaceId: places.one,
      addPlaceId: places.spare,
    });
    await b.as("steward").mutation(api.collection.swapPlace, {
      setId,
      panelIndex: 3,
      addPlaceId: places.one,
    });
    const spot = await b.as("hana").query(api.collection.forPlace, { placeId: places.one! });
    expect(spot).toMatchObject({ panelIndex: 3, visited: false, panelDyed: false });
    expect(await check("hana", "one")).toMatchObject({
      outcome: "dyed",
      panelIndex: 3,
      dyedCount: 2,
    });
    expect(await check("hana", "one")).toMatchObject({ outcome: "already_here", dyedCount: 2 });
  });

  it("refuses a panel the set does not have", async () => {
    const { b, places, setId } = await setup();
    for (const panelIndex of [-1, 1.5, 6, 99]) {
      await expect(
        b.as("steward").mutation(api.collection.swapPlace, {
          setId,
          panelIndex,
          addPlaceId: places.spare,
        }),
      ).rejects.toThrow();
    }
  });

  it("keeps a dyed panel when its place leaves the set", async () => {
    const context = await setup();
    const { b, check, places, setId } = context;
    await check("hana", "one");
    await b.as("steward").mutation(api.collection.swapPlace, {
      setId,
      panelIndex: 0,
      removePlaceId: places.one,
      addPlaceId: places.spare,
    });
    const set = await b.as("hana").query(api.collection.set, WHERE);
    expect(set?.panels[0]).toMatchObject({ dyed: true, artUrl: expect.any(String) });
  });
});

describe("lines from a place's story", () => {
  it("falls back to the first live sentence, then to none", async () => {
    const { b, places, steward } = await setup();
    const lineOn = async () =>
      (await b.t.query(api.collection.set, WHERE))?.panels[0]?.places[0]?.line;
    expect(await lineOn()).toBeNull();
    await addStory(b, places.one!, steward, ["They roast the beans here.", "Try the toast."]);
    expect(await lineOn()).toEqual({
      en: "They roast the beans here.",
      ja: "They roast the beans here.（日本語）",
      postsRead: 4,
    });
  });

  it("shows a picked line only while it is live, and removes it with its story", async () => {
    const { b, places, steward } = await setup();
    const { storyId } = await addStory(b, places.one!, steward, ["First.", "Try the toast."]);
    await b.as("steward").mutation(api.collection.pickLine, {
      placeId: places.one!,
      en: "Try the toast.",
    });
    const picked = async () =>
      (await b.t.query(api.collection.forPlace, { placeId: places.one! }))?.pickedLine;
    expect((await picked())?.en).toBe("Try the toast.");
    expect((await b.t.query(api.collection.set, WHERE))?.panels[0]?.places[0]?.line?.en).toBe(
      "Try the toast.",
    );
    await b.run((ctx) => ctx.db.patch("placeStory", storyId, { withdrawnAt: 1 }));
    expect(await picked()).toBeNull();
    expect((await b.t.query(api.collection.set, WHERE))?.panels[0]?.places[0]?.line).toBeNull();
  });

  it("refuses to pick text that is not a live sentence", async () => {
    const { b, places, steward } = await setup();
    await addStory(b, places.one!, steward, ["First."]);
    expect(
      await errorCode(
        b.as("steward").mutation(api.collection.pickLine, {
          placeId: places.one!,
          en: "Something new I just wrote.",
        }),
      ),
    ).toBe("invalid_input");
  });

  it("lets only a steward pick", async () => {
    const { b, places } = await setup();
    expect(
      await errorCode(
        b.as("hana").mutation(api.collection.pickLine, { placeId: places.one!, en: null }),
      ),
    ).toBe("forbidden");
  });
});

describe("looking after a set", () => {
  it("refuses to go live without art or a usable place", async () => {
    const { b, setId, places } = await setup({ live: false });
    await b.run(async (ctx) => {
      const panel = await ctx.db
        .query("collectionPanel")
        .withIndex("by_setId_and_index", (q) => q.eq("setId", setId).eq("index", 0))
        .unique();
      await ctx.db.patch("collectionPanel", panel!._id, { artId: undefined });
    });
    const goLive = () =>
      b.as("steward").mutation(api.collection.setStatus, { setId, status: "live" });
    expect(await errorCode(goLive())).toBe("conflict");

    const storageId = await b.run((ctx) => ctx.storage.store(new Blob(["art"])));
    await b.t.mutation(internal.collection.attachArt, { ...WHERE, panelIndex: 0, storageId });
    await b.run((ctx) => ctx.db.patch("place", places.one!, { visibility: "draft" }));
    expect(await errorCode(goLive())).toBe("conflict");

    await b.run((ctx) => ctx.db.patch("place", places.one!, { visibility: "public" }));
    await goLive();
  });

  it("audits a steward's changes", async () => {
    const { b, setId } = await setup();
    await b.as("steward").mutation(api.collection.setStatus, { setId, status: "draft" });
    const entries = await b.run((ctx) => ctx.db.query("auditLog").take(100));
    expect(entries.map(({ action }) => action)).toContain("collection.set_status");
  });

  it("keeps 1 to 3 places on a panel and each place on one panel", async () => {
    const { b, setId, places } = await setup();
    const swap = (
      panelIndex: number,
      change: { removePlaceId?: Id<"place">; addPlaceId?: Id<"place"> },
    ) => b.as("steward").mutation(api.collection.swapPlace, { setId, panelIndex, ...change });
    expect(await errorCode(swap(0, { removePlaceId: places.one! }))).toBe("conflict");
    expect(await errorCode(swap(0, { addPlaceId: places.two! }))).toBe("conflict");
    await swap(5, { addPlaceId: places.spare! });
    const steward = await b
      .as("steward")
      .query(api.collection.listForSteward, { regionId: "nagasaki" });
    expect(steward[0]?.panels[5]?.places).toHaveLength(3);
    const another = await addPlace(b, {
      createdBy: (await b.run((ctx) => ctx.db.query("person").first()))!._id,
      visibility: "public",
    });
    await b.run((ctx) => ctx.db.patch("place", another, { mapPin: { lat: 32.74, lng: 129.87 } }));
    expect(await errorCode(swap(5, { addPlaceId: another }))).toBe("conflict");
  });

  it("flags two places closer than 50 m and lists public places to swap in", async () => {
    const { b, places } = await setup();
    const [set] = await b
      .as("steward")
      .query(api.collection.listForSteward, { regionId: "nagasaki" });
    expect(set?.tooClose.length).toBeGreaterThan(0);
    expect(set?.tooClose[0]?.metres).toBe(0);
    expect(set?.candidates.map(({ placeId }) => placeId)).toEqual([places.spare]);
  });

  it("is steward only", async () => {
    const { b, setId } = await setup();
    expect(
      await errorCode(b.as("hana").query(api.collection.listForSteward, { regionId: "nagasaki" })),
    ).toBe("forbidden");
    expect(
      await errorCode(b.as("hana").mutation(api.collection.setStatus, { setId, status: "draft" })),
    ).toBe("forbidden");
  });

  it("refuses a set for an unknown neighbourhood, a wrong size or a place that isn't public", async () => {
    const { b, steward } = await setup();
    await addPlace(b, { createdBy: steward, visibility: "draft", slug: "drafty" });
    const base = { regionId: "nagasaki", names: SHINCHI };
    const six = [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]];
    expect(
      await errorCode(
        b.t.mutation(internal.collection.createSet, {
          ...base,
          neighbourhoodId: "nowhere",
          panels: six,
        }),
      ),
    ).toBe("invalid_input");
    expect(
      await errorCode(
        b.t.mutation(internal.collection.createSet, {
          ...base,
          neighbourhoodId: "dejima",
          panels: [["a"]],
        }),
      ),
    ).toBe("invalid_input");
    expect(
      await errorCode(
        b.t.mutation(internal.collection.createSet, {
          ...base,
          neighbourhoodId: "dejima",
          panels: [["drafty"], ...six.slice(1)],
        }),
      ),
    ).toBe("invalid_input");
    expect(
      await errorCode(
        b.t.mutation(internal.collection.createSet, {
          ...base,
          neighbourhoodId: "shinchi",
          panels: six,
        }),
      ),
    ).toBe("conflict");
  });
});

describe("collection.repeatVisitTotals", () => {
  it("returns two totals, counting a second place on the same or next day, and no demo account", async () => {
    const { b, check, kenta } = await setup();
    await check("hana", "one");
    await check("hana", "two");
    await check("kenta", "one");
    await member(b, "demo", { isMock: true });
    const totals = await b.t.query(internal.collection.repeatVisitTotals, {});
    expect(totals).toEqual({ checkedIn: 2, cameBackSoon: 1 });
    expect(Object.keys(totals)).toHaveLength(2);
    expect(kenta).toBeDefined();
  });
});

describe("people.ensureCurrent", () => {
  it("makes the collection row with the person, and for an existing person with none", async () => {
    const b = newBackend(modules);
    const id = await addPerson(b, "older", "user");
    const row = () =>
      b.run((ctx) =>
        ctx.db
          .query("personCollection")
          .withIndex("by_personId", (q) => q.eq("personId", id))
          .unique(),
      );
    expect(await row()).toBeNull();
    await b.as("older").mutation(api.people.ensureCurrent, {});
    const first = await row();
    expect(first).toMatchObject({ visits: [], badges: [] });
    await b.as("older").mutation(api.people.ensureCurrent, {});
    expect((await row())?._id).toBe(first?._id);
  });
});
