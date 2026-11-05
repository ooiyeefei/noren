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
afterEach(() => vi.restoreAllMocks());

async function setup() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "stamp-steward", "steward");
  const hana = await addPerson(b, "stamp-hana", "user");
  const kenta = await addPerson(b, "stamp-kenta", "user");
  const first = await addPlace(b, { createdBy: steward, visibility: "public", slug: "first" });
  const second = await addPlace(b, { createdBy: steward, visibility: "public", slug: "second" });
  return { b, steward, hana, kenta, first, second };
}
const write = { body: "店主が昔の話をしてくれました。", lang: "ja" };

it("gives one stamp per place, dated by the earliest thing the person did there", async () => {
  const { b, hana, first, second } = await setup();
  const asHana = b.as("stamp-hana");
  const storyId = await asHana.mutation(api.stories.add, { placeId: first, ...write });
  await asHana.mutation(api.checks.confirm, { placeId: first });
  const sourceId = await addSource(b, { placeId: second, addedBy: hana });
  const times = await b.t.run(async (ctx) => ({
    story: (await ctx.db.get("story", storyId))?._creationTime,
    source: (await ctx.db.get("source", sourceId))?._creationTime,
  }));

  const stamps = await asHana.query(api.stampBook.mine, {});
  expect(stamps.map(({ slug, stampedAt }) => ({ slug, stampedAt }))).toEqual([
    { slug: "second", stampedAt: times.source },
    { slug: "first", stampedAt: times.story },
  ]);
  expect(stamps[0]?.names).toContainEqual(
    expect.objectContaining({ lang: "ja", value: "テスト店" }),
  );
  expect(await asHana.query(api.stampBook.forPlace, { placeId: first })).toEqual({
    stampedAt: times.story,
  });
});

it("shows a person only their own stamps, and only to them", async () => {
  const { b, kenta, first, second } = await setup();
  await b.as("stamp-hana").mutation(api.checks.confirm, { placeId: first });
  await b.as("stamp-kenta").mutation(api.checks.confirm, { placeId: second });

  const mine = await b.as("stamp-hana").query(api.stampBook.mine, {});
  expect(mine.map(({ slug }) => slug)).toEqual(["first"]);
  const asKenta = b.as("stamp-kenta");
  expect((await asKenta.query(api.stampBook.mine, {})).map(({ slug }) => slug)).toEqual(["second"]);
  expect(await asKenta.query(api.stampBook.forPlace, { placeId: first })).toBeNull();

  // Nobody can ask for someone else's book: signed out it fails, and no argument names a person.
  expect(await errorCode(b.t.query(api.stampBook.mine, {}))).toBe("unauthenticated");
  expect(await b.t.query(api.stampBook.forPlace, { placeId: second })).toBeNull();
  await expect(
    b.as("stamp-hana").query(api.stampBook.mine, { personId: kenta } as never),
  ).rejects.toThrow();
});

it("returns stamps and no total, count or rank", async () => {
  const { b, first } = await setup();
  await b.as("stamp-hana").mutation(api.checks.confirm, { placeId: first });
  const [stamp] = await b.as("stamp-hana").query(api.stampBook.mine, {});
  expect(Object.keys(stamp ?? {}).sort()).toEqual(["names", "placeId", "slug", "stampedAt"]);
});

it("earns no stamp for a report, a removed story, a hidden link or a post the finder found", async () => {
  const { b, steward, hana, first, second } = await setup();
  const asHana = b.as("stamp-hana");
  await asHana.mutation(api.checks.report, { placeId: first, problem: "closed" });
  const storyId = await asHana.mutation(api.stories.add, { placeId: first, ...write });
  await asHana.mutation(api.stories.remove, { storyId });
  await addSource(b, { placeId: second, addedBy: hana, status: "hidden" });
  expect(await asHana.query(api.stampBook.mine, {})).toEqual([]);

  const found = await addSource(b, { placeId: second, addedBy: steward });
  await b.t.run((ctx) => ctx.db.patch("source", found, { origin: "story_finder" }));
  expect(await b.as("stamp-steward").query(api.stampBook.mine, {})).toEqual([]);
});

it("drops a stamp when the place is no longer readable", async () => {
  const { b, first } = await setup();
  await b.as("stamp-hana").mutation(api.checks.confirm, { placeId: first });
  await b.t.run((ctx) => ctx.db.patch("place", first, { visibility: "draft" }));
  expect(await b.as("stamp-hana").query(api.stampBook.mine, {})).toEqual([]);
  expect(await b.as("stamp-hana").query(api.stampBook.forPlace, { placeId: first })).toBeNull();
});

it("stays bounded for a person with far more rows than a book shows", async () => {
  // 500 rows from each table, 300 place reads and the person: within budget however many rows exist.
  const b = newBackend(modules, {
    transactionLimits: { documentsRead: 1802, databaseQueries: 400 },
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
        }),
      );
    for (const placeId of places) {
      const common = { placeId, isMock: false };
      await ctx.db.insert("placeCheck", {
        ...common,
        regionId: "nagasaki",
        personId,
        verdict: "still_here",
      });
      await ctx.db.insert("story", {
        ...common,
        authorPersonId: personId,
        body: "話",
        lang: "ja",
        status: "live",
      });
    }
  });
  const stamps = await b.as("bound-hana").query(api.stampBook.mine, {});
  expect(stamps).toHaveLength(300);
  // The newest rows win, so a stamp just earned always shows.
  expect(stamps[0]?.slug).toBe("bound-699");
  const newest = await b.t.run(async (ctx) =>
    ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) =>
        q.eq("regionId", "nagasaki").eq("slug", "bound-699"),
      )
      .unique(),
  );
  expect(await b.as("bound-hana").query(api.stampBook.forPlace, { placeId: newest!._id })).toEqual({
    stampedAt: expect.any(Number),
  });
});

async function inSet(
  b: Awaited<ReturnType<typeof setup>>["b"],
  steward: Id<"person">,
  placeId: Id<"place">,
) {
  await b.run(async (ctx) => {
    const setId = await ctx.db.insert("collectionSet", {
      regionId: "nagasaki",
      neighbourhoodId: "shinchi",
      names: { ja: "新地中華街", en: "Shinchi" },
      panelCount: 6,
      status: "live",
    });
    await ctx.db.insert("collectionPlace", { setId, panelIndex: 0, placeId });
    await ctx.db.insert("personCollection", {
      personId: steward,
      visits: [],
      badges: [],
    });
  });
}

it("adds a stamp for a check-in, dated by the visit's day in Japan, with no total", async () => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 5, 15, 30) });
  try {
    const { b, steward, first } = await setup();
    await inSet(b, steward, first);
    const asSteward = b.as("stamp-steward");
    await asSteward.mutation(api.collection.checkIn, { placeId: first });
    const stamps = await asSteward.query(api.stampBook.mine, {});
    expect(stamps.map(({ slug }) => slug)).toEqual(["first"]);
    expect(new Date(stamps[0]!.stampedAt).toISOString().slice(0, 10)).toBe("2026-11-06");
    expect(await asSteward.query(api.stampBook.forPlace, { placeId: first })).toEqual({
      stampedAt: stamps[0]!.stampedAt,
    });
    expect(Array.isArray(stamps)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("keeps one stamp, the earliest, when a check-in follows an earlier story", async () => {
  vi.useFakeTimers({ now: Date.UTC(2026, 10, 1, 3, 0) });
  try {
    const { b, steward, first } = await setup();
    await inSet(b, steward, first);
    const asSteward = b.as("stamp-steward");
    await asSteward.mutation(api.stories.add, { placeId: first, ...write });
    vi.setSystemTime(Date.UTC(2026, 10, 5, 3, 0));
    await asSteward.mutation(api.collection.checkIn, { placeId: first });
    const stamps = await asSteward.query(api.stampBook.mine, {});
    expect(stamps).toHaveLength(1);
    expect(new Date(stamps[0]!.stampedAt).toISOString().slice(0, 10)).toBe("2026-11-01");
  } finally {
    vi.useRealTimers();
  }
});
