/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { SHARED_POSTS_LISTED } from "../src/lib/domain/constants";
import { addPerson, addPlace, addSource, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { countDay } from "./links";

const modules = import.meta.glob("./**/*.ts");
const video = "https://www.youtube.com/watch?v=abcdefghijk";

async function world() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const sharer = await addPerson(b, "sharer", "user");
  await addPerson(b, "other", "user");
  await addPerson(b, "demo", "user", { isMock: true });
  const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
  const share = async (as = "sharer", where: Id<"place"> = placeId, url = video) =>
    (
      await b
        .as(as)
        .mutation(api.sources.add, { placeId: where, url, note: "猫。", noteLang: "ja" })
    ).sourceId;
  const counts = () => b.run((ctx) => ctx.db.query("linkCountDaily").take(100));
  return { b, steward, sharer, placeId, share, counts };
}

describe("visits Noren sends to a shared post", () => {
  it("three visitors following the link give its sharer a total of three, and nothing about them", async () => {
    const { b, share, counts } = await world();
    const sourceId = await share();
    for (let n = 0; n < 3; n++)
      expect(await b.t.mutation(api.links.follow, { sourceId })).toBe(
        "https://www.youtube.com/watch?v=abcdefghijk",
      );
    // One row a day per post, holding nothing but the total.
    expect(await counts()).toEqual([
      {
        _id: expect.any(String),
        _creationTime: expect.any(Number),
        sourceId,
        day: countDay(Date.now()),
        count: 3,
        isMock: false,
      },
    ]);
    const mine = await b.as("sharer").query(api.links.mine, {});
    expect(mine).toMatchObject([
      {
        sourceId,
        platform: "youtube",
        note: "猫。",
        visits: 3,
        recentVisits: 3,
        shownToEveryone: true,
      },
    ]);
    expect(await b.as("other").query(api.links.mine, {})).toEqual([]);
    expect(await errorCode(b.t.query(api.links.mine, {}))).toBe("unauthenticated");
  });

  it("a crawler or prefetch learns where the link goes without being counted", async () => {
    const { b, share, counts } = await world();
    const sourceId = await share();
    expect(await b.t.query(api.links.peek, { sourceId })).toBe(video);
    expect(await counts()).toEqual([]);
  });

  it("counts and sends on only for a post everyone may see", async () => {
    const { b, steward, placeId, share, counts } = await world();
    const draft = await addPlace(b, { createdBy: steward });
    const refused = [
      await addSource(b, { placeId, addedBy: steward }),
      await share("demo"),
      await share("steward", draft),
      await addSource(b, { placeId, addedBy: steward, status: "gone", demoConsentBy: steward }),
    ];
    const hidden = await share("sharer", placeId, "https://www.youtube.com/watch?v=bcdefghijkl");
    await b.as("sharer").mutation(api.sources.remove, { sourceId: hidden });
    for (const sourceId of [...refused, hidden, "not-an-id", placeId]) {
      expect(await b.t.mutation(api.links.follow, { sourceId })).toBeNull();
      expect(await b.t.query(api.links.peek, { sourceId })).toBeNull();
    }
    expect(await counts()).toEqual([]);
    // The sharer still sees why a post of theirs is not counted.
    expect(
      (await b.as("sharer").query(api.links.mine, {})).map(({ status, shownToEveryone }) => ({
        status,
        shownToEveryone,
      })),
    ).toEqual([{ status: "hidden", shownToEveryone: false }]);
  });

  it("keeps a demo post's count tagged as demo", async () => {
    const { b, steward, share, counts } = await world();
    const demoPlace = await addPlace(b, {
      createdBy: steward,
      visibility: "demo_public",
      isMock: true,
    });
    const sourceId = await share("demo", demoPlace);
    await b.t.mutation(api.links.follow, { sourceId });
    expect((await counts()).map((row) => row.isMock)).toEqual([true]);
  });

  it("adds up the past year, and the last 30 days apart", async () => {
    const { b, share } = await world();
    const sourceId = await share();
    const day = (daysAgo: number) => countDay(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    await b.run(async (ctx) => {
      for (const [daysAgo, count] of [
        [29, 2],
        [30, 5],
        [364, 7],
        [365, 11],
      ] as const)
        await ctx.db.insert("linkCountDaily", {
          sourceId,
          day: day(daysAgo),
          count,
          isMock: false,
        });
    });
    await b.t.mutation(api.links.follow, { sourceId });
    expect(await b.as("sharer").query(api.links.mine, {})).toMatchObject([
      { visits: 15, recentVisits: 3 },
    ]);
  });

  it("lists the member's newest posts, up to the number their page shows", async () => {
    const { b, sharer, placeId } = await world();
    const added = [];
    for (let n = 0; n <= SHARED_POSTS_LISTED; n++)
      added.push(await addSource(b, { placeId, addedBy: sharer }));
    const listed = await b.as("sharer").query(api.links.mine, {});
    expect(listed.map((post) => post.sourceId)).toEqual(added.slice(1).reverse());
  });
});
