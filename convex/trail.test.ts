/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addPerson, addPlace, addSource, errorCode, newBackend } from "../tests/convex/fixtures";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "trail-steward", "steward");
  const hana = await addPerson(b, "trail-hana", "user");
  const kenta = await addPerson(b, "trail-kenta", "user");
  const first = await addPlace(b, { createdBy: steward, visibility: "public", slug: "first" });
  const second = await addPlace(b, { createdBy: steward, visibility: "public", slug: "second" });
  return { b, steward, hana, kenta, first, second };
}
const write = { body: "店主が昔の話をしてくれました。", lang: "ja" };

async function inSet(
  b: Awaited<ReturnType<typeof setup>>["b"],
  placeId: Id<"place">,
  personId: Id<"person">,
) {
  await b.run(async (ctx) => {
    const setId = await ctx.db.insert("collectionSet", {
      regionId: "nagasaki",
      neighbourhoodId: "shinchi",
      names: { ja: "新地中華街", en: "Shinchi" },
      panelCount: 6,
      status: "live",
    });
    await ctx.db.insert("collectionPlace", { setId, panelIndex: 2, placeId });
    await ctx.db.insert("personCollection", { personId, visits: [], badges: [] });
  });
}

it("returns each stamped place with its pin, names, slug and the day of its stamp", async () => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 5, 3, 0) });
  const { b, first } = await setup();
  await b.run((ctx) => ctx.db.patch("place", first, { neighbourhood: "shinchi" }));
  const storyId = await b.as("trail-hana").mutation(api.stories.add, { placeId: first, ...write });
  const at = (await b.run((ctx) => ctx.db.get("story", storyId)))!._creationTime;

  const [place, ...rest] = await b.as("trail-hana").query(api.trail.mine, {});
  expect(rest).toEqual([]);
  expect(place).toMatchObject({
    placeId: first,
    slug: "first",
    pin: { lat: expect.any(Number), lng: expect.any(Number) },
    areaNames: { ja: "新地中華街", en: "Shinchi" },
    stampDay: "2026-11-05",
    stampedAt: at,
    stampTime: at,
  });
  expect(place?.names).toContainEqual(expect.objectContaining({ lang: "ja", value: "テスト店" }));
  expect(place?.moments).toEqual([
    {
      kind: "story",
      at,
      day: "2026-11-05",
      timed: true,
      body: write.body,
      lang: "ja",
      photos: [],
    },
  ]);
});

it("holds the same places as the stamp book", async () => {
  const { b, hana, first, second } = await setup();
  const asHana = b.as("trail-hana");
  await asHana.mutation(api.stories.add, { placeId: first, ...write });
  await addSource(b, { placeId: second, addedBy: hana });
  const hidden = await addPlace(b, { createdBy: hana, visibility: "public", slug: "third" });
  await addSource(b, { placeId: hidden, addedBy: hana, status: "hidden" });
  const stamps = await asHana.query(api.stampBook.mine, {});
  const trail = await asHana.query(api.trail.mine, {});
  expect(trail.map(({ slug }) => slug).sort()).toEqual(stamps.map(({ slug }) => slug).sort());
  expect(trail.map(({ slug }) => slug)).not.toContain("third");
  for (const stamp of stamps)
    expect(trail.find(({ slug }) => slug === stamp.slug)?.stampedAt).toBe(stamp.stampedAt);
});

it("shows a person only their own places and moments, and nothing signed out", async () => {
  const { b, first, second } = await setup();
  await b.as("trail-hana").mutation(api.stories.add, { placeId: first, ...write });
  await b.as("trail-kenta").mutation(api.stories.add, { placeId: second, ...write });
  await b.as("trail-kenta").mutation(api.stories.add, { placeId: first, ...write, body: "別の話" });

  const mine = await b.as("trail-hana").query(api.trail.mine, {});
  expect(mine.map(({ slug }) => slug)).toEqual(["first"]);
  expect(JSON.stringify(mine)).not.toContain("別の話");
  expect(mine[0]?.moments).toHaveLength(1);

  expect(await errorCode(b.t.query(api.trail.mine, {}))).toBe("unauthenticated");
  await expect(
    b.as("trail-hana").query(api.trail.mine, { personId: "x" } as never),
  ).rejects.toThrow();
});

it("returns places and moments and no total, count or rank", async () => {
  const { b, first } = await setup();
  await b.as("trail-hana").mutation(api.stories.add, { placeId: first, ...write });
  const result = await b.as("trail-hana").query(api.trail.mine, {});
  expect(Array.isArray(result)).toBe(true);
  expect(Object.keys(result[0] ?? {}).sort()).toEqual([
    "areaNames",
    "moments",
    "names",
    "pin",
    "placeId",
    "slug",
    "stampDay",
    "stampTime",
    "stampedAt",
  ]);
});

it("lists a linked post, a check-in and a Still here as moments, newest first", async () => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 1, 1, 0) });
  const { b, hana, first } = await setup();
  await inSet(b, first, hana);
  const asHana = b.as("trail-hana");
  await asHana.mutation(api.checks.confirm, { placeId: first });
  vi.setSystemTime(Date.UTC(2026, 10, 2, 1, 0));
  const sourceId = await addSource(b, { placeId: first, addedBy: hana });
  await b.t.run((ctx) =>
    ctx.db.patch("source", sourceId, {
      title: "Lunch there",
      creatorNote: "The toast was thick.",
      noteLang: "en",
    }),
  );
  vi.setSystemTime(Date.UTC(2026, 10, 3, 1, 0));
  await asHana.mutation(api.collection.checkIn, { placeId: first });

  const [place] = await asHana.query(api.trail.mine, {});
  expect(place?.moments.map(({ kind }) => kind)).toEqual(["check_in", "post", "still_here"]);
  expect(place?.moments[0]).toMatchObject({
    kind: "check_in",
    day: "2026-11-03",
    timed: false,
    panel: 3,
    setNames: { en: "Shinchi", ja: "新地中華街" },
  });
  expect(place?.moments[1]).toMatchObject({
    kind: "post",
    title: "Lunch there",
    note: "The toast was thick.",
    noteLang: "en",
    timed: true,
  });
  expect(place?.moments[2]).toMatchObject({ kind: "still_here", timed: true });
});

it("leaves out a removed story, a hidden link and a post the finder found", async () => {
  const { b, steward, hana, first, second } = await setup();
  const asHana = b.as("trail-hana");
  const storyId = await asHana.mutation(api.stories.add, { placeId: first, ...write });
  await asHana.mutation(api.stories.remove, { storyId });
  await addSource(b, { placeId: second, addedBy: hana, status: "hidden" });
  expect(await asHana.query(api.trail.mine, {})).toEqual([]);

  const found = await addSource(b, { placeId: second, addedBy: steward });
  await b.t.run((ctx) => ctx.db.patch("source", found, { origin: "story_finder" }));
  expect(await b.as("trail-steward").query(api.trail.mine, {})).toEqual([]);
});

it("keeps a place's Still here out when it is only a report, and drops places it can't show", async () => {
  const { b, first, second } = await setup();
  const asHana = b.as("trail-hana");
  await asHana.mutation(api.checks.report, { placeId: first, problem: "closed" });
  expect(await asHana.query(api.trail.mine, {})).toEqual([]);

  await asHana.mutation(api.checks.confirm, { placeId: second });
  await b.t.run((ctx) => ctx.db.patch("place", second, { visibility: "draft" }));
  expect(await asHana.query(api.trail.mine, {})).toEqual([]);
});

it("skips a place with no pin, since it has nowhere on a map", async () => {
  const { b, steward } = await setup();
  const unpinned = await addPlace(b, {
    createdBy: steward,
    visibility: "public",
    slug: "unpinned",
    withPin: false,
  });
  await b.as("trail-hana").mutation(api.checks.confirm, { placeId: unpinned });
  expect(await b.as("trail-hana").query(api.trail.mine, {})).toEqual([]);
  // The stamp book still holds it.
  expect(await b.as("trail-hana").query(api.stampBook.mine, {})).toHaveLength(1);
});

it("gives a story's own photos, including one still waiting for a steward", async () => {
  const { b, hana, first } = await setup();
  const storyId = await b.as("trail-hana").mutation(api.stories.add, { placeId: first, ...write });
  await b.t.run(async (ctx) => {
    for (const [position, status, key] of [
      [0, "live", "photos/one.jpg"],
      [1, "waiting", "photos/two.jpg"],
    ] as const)
      await ctx.db.insert("storyPhoto", {
        placeId: first,
        uploaderPersonId: hana,
        storyId,
        position,
        status,
        incomingKey: `incoming/${position}`,
        key,
        width: 2048,
        height: 1536,
      });
  });
  const [place] = await b.as("trail-hana").query(api.trail.mine, {});
  const story = place?.moments[0];
  expect(story?.kind === "story" && story.photos).toEqual([
    { key: "photos/one.jpg", width: 2048, height: 1536, waiting: false },
    { key: "photos/two.jpg", width: 2048, height: 1536, waiting: true },
  ]);
  // Someone else's trail never carries it.
  expect(await b.as("trail-kenta").query(api.trail.mine, {})).toEqual([]);
});

it("knows the time of day only for what carried one", async () => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 5, 3, 0) });
  const { b, hana, first, second } = await setup();
  await inSet(b, first, hana);
  const asHana = b.as("trail-hana");
  await asHana.mutation(api.collection.checkIn, { placeId: first });
  vi.setSystemTime(Date.UTC(2026, 10, 5, 8, 0));
  await asHana.mutation(api.stories.add, { placeId: second, ...write });

  const bySlug = async () =>
    Object.fromEntries(
      (await asHana.query(api.trail.mine, {})).map((place) => [place.slug, place]),
    );
  // A check-in keeps only its day, so its place has a date and no time.
  expect((await bySlug()).first).toMatchObject({ stampDay: "2026-11-05", stampTime: null });
  expect((await bySlug()).second?.stampTime).toBeCloseTo(Date.UTC(2026, 10, 5, 8, 0), 0);

  // A story the same day gives that place a time.
  vi.setSystemTime(Date.UTC(2026, 10, 5, 9, 0));
  await asHana.mutation(api.stories.add, { placeId: first, ...write });
  expect((await bySlug()).first?.stampTime).toBeCloseTo(Date.UTC(2026, 10, 5, 9, 0), 0);
});

it("keeps the newest moments of a place and still dates the stamp by the first", async () => {
  const { b, hana, first } = await setup();
  await b.t.run(async (ctx) => {
    for (let i = 0; i < 25; i++)
      await ctx.db.insert("story", {
        placeId: first,
        authorPersonId: hana,
        body: `story ${i}`,
        lang: "en",
        status: "live",
        isMock: false,
      });
  });
  const [place] = await b.as("trail-hana").query(api.trail.mine, {});
  expect(place?.moments).toHaveLength(20);
  const bodies = place?.moments.map((moment) => (moment.kind === "story" ? moment.body : ""));
  expect(bodies?.[0]).toBe("story 24");
  expect(bodies?.at(-1)).toBe("story 5");
  const earliest = await b.t.run(
    async (ctx) => (await ctx.db.query("story").order("asc").first())?._creationTime,
  );
  expect(place?.stampedAt).toBe(earliest);
});

it("stays bounded for a person with far more rows than a trail shows", async () => {
  const b = newBackend(modules, {
    transactionLimits: { documentsRead: 2500, databaseQueries: 2000 },
  });
  const steward = await addPerson(b, "bound-steward", "steward");
  const personId = await addPerson(b, "bound-hana", "user");
  await b.t.run(async (ctx) => {
    const places: Id<"place">[] = [];
    for (let i = 0; i < 700; i++)
      places.push(
        await ctx.db.insert("place", {
          regionId: "nagasaki",
          slug: `bound-${i}`,
          visibility: "public",
          createdBy: steward,
          isMock: false,
          mapNames: [{ lang: "ja", script: "kanji", value: `試験店${i}`, isPrimary: true }],
          mapPin: { lat: 32.75, lng: 129.87 },
        }),
      );
    for (const placeId of places) {
      await ctx.db.insert("placeCheck", {
        placeId,
        isMock: false,
        regionId: "nagasaki",
        personId,
        verdict: "still_here",
      });
      await ctx.db.insert("story", {
        placeId,
        isMock: false,
        authorPersonId: personId,
        body: "話",
        lang: "ja",
        status: "live",
      });
    }
  });
  const trail = await b.as("bound-hana").query(api.trail.mine, {});
  expect(trail).toHaveLength(300);
  expect(trail.at(-1)?.slug).toBe("bound-699");
  for (const place of trail) expect(place.moments.length).toBeLessThanOrEqual(20);
});
