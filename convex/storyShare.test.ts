/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRegionConfig } from "../src/lib/region/registry";
import { addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const sharing = () => getRegionConfig("nagasaki")!.sharing;

async function world() {
  const b = newBackend(modules);
  await addPerson(b, "writer", "user", { joinedDaysAgo: 30 });
  const steward = await addPerson(b, "steward", "steward");
  await addPerson(b, "other", "user");
  const editor = await addPerson(b, "editor", "creator");
  const placeId = await addPlace(b, { createdBy: editor, visibility: "public" });
  void steward;
  return { b, placeId };
}
const tell = (b: Awaited<ReturnType<typeof world>>["b"], placeId: never, shareConsent?: boolean) =>
  b.as("writer").mutation(api.stories.add, {
    placeId,
    body: "The tram stop here is older than the street.",
    lang: "en",
    ...(shareConsent === undefined ? {} : { shareConsent }),
  });

beforeEach(() => {
  sharing().norenAccount = true;
});
afterEach(() => {
  sharing().norenAccount = false;
});

describe("the writer's tick", () => {
  it("is stored with its time only when ticked", async () => {
    const { b, placeId } = await world();
    const ticked = await tell(b, placeId as never, true);
    const plain = await tell(b, placeId as never);
    const unticked = await tell(b, placeId as never, false);
    const rows = await b.run(async (ctx) => [
      await ctx.db.get("story", ticked),
      await ctx.db.get("story", plain),
      await ctx.db.get("story", unticked),
    ]);
    expect(rows[0]?.shareConsentAt).toEqual(expect.any(Number));
    expect(rows[1]?.shareConsentAt).toBeUndefined();
    expect(rows[2]?.shareConsentAt).toBeUndefined();
  });

  it("is refused while the region does not offer it", async () => {
    const { b, placeId } = await world();
    sharing().norenAccount = false;
    expect(await errorCode(tell(b, placeId as never, true))).toBe("invalid_input");
  });

  it("is withdrawn by the writer alone", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    expect(await b.as("writer").query(api.storyShare.consentOf, { storyId })).toBe(true);
    expect(await b.as("other").query(api.storyShare.consentOf, { storyId })).toBe(false);
    expect(await errorCode(b.as("other").mutation(api.storyShare.withdraw, { storyId }))).toBe(
      "forbidden",
    );
    await b.as("writer").mutation(api.storyShare.withdraw, { storyId });
    expect(await b.as("writer").query(api.storyShare.consentOf, { storyId })).toBe(false);
    // Withdrawing twice is harmless.
    await b.as("writer").mutation(api.storyShare.withdraw, { storyId });
    const queue = await b.as("steward").query(api.storyShare.queue, { regionId: "nagasaki" });
    expect(queue).toEqual([]);
  });
});

describe("the steward queue", () => {
  it("is for stewards only", async () => {
    const { b } = await world();
    expect(
      await errorCode(b.as("writer").query(api.storyShare.queue, { regionId: "nagasaki" })),
    ).toBe("forbidden");
    await expect(b.t.query(api.storyShare.queue, { regionId: "nagasaki" })).rejects.toBeDefined();
  });

  it("lists live, consented stories newest first, and drops removed or withdrawn ones", async () => {
    const { b, placeId } = await world();
    const first = await tell(b, placeId as never, true);
    await tell(b, placeId as never); // no tick
    const third = await tell(b, placeId as never, true);
    const steward = b.as("steward");
    const queue = await steward.query(api.storyShare.queue, { regionId: "nagasaki" });
    expect(queue.map((entry) => entry.storyId)).toEqual([third, first]);
    expect(queue[0]).toMatchObject({
      authorName: "Test Person (writer)",
      postedAt: null,
      hasPhoto: false,
    });
    await b.as("writer").mutation(api.stories.remove, { storyId: first });
    expect(
      (await steward.query(api.storyShare.queue, { regionId: "nagasaki" })).map((e) => e.storyId),
    ).toEqual([third]);
    await b.as("writer").mutation(api.storyShare.withdraw, { storyId: third });
    expect(await steward.query(api.storyShare.queue, { regionId: "nagasaki" })).toEqual([]);
  });

  it("leaves out a story on a place that is not public", async () => {
    const { b, placeId } = await world();
    await tell(b, placeId as never, true);
    await b.run(async (ctx) => ctx.db.patch("place", placeId, { visibility: "draft" }));
    expect(await b.as("steward").query(api.storyShare.queue, { regionId: "nagasaki" })).toEqual([]);
  });

  it("marks a story posted once, with an audit entry, and only for stewards", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    expect(await errorCode(b.as("writer").mutation(api.storyShare.markPosted, { storyId }))).toBe(
      "forbidden",
    );
    await b.as("steward").mutation(api.storyShare.markPosted, { storyId });
    await b.as("steward").mutation(api.storyShare.markPosted, { storyId });
    const [entry] = await b.as("steward").query(api.storyShare.queue, { regionId: "nagasaki" });
    expect(entry?.postedAt).toEqual(expect.any(Number));
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(audits.filter((a) => a.action === "story.share_posted")).toHaveLength(1);
    const plain = await tell(b, placeId as never);
    expect(
      await errorCode(b.as("steward").mutation(api.storyShare.markPosted, { storyId: plain })),
    ).toBe("conflict");
  });
});

describe("the picture's data", () => {
  it("is the same for everyone, signed in or not", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never);
    const card = await b.t.query(api.storyShare.card, { storyId });
    expect(card).toMatchObject({
      body: "The tram stop here is older than the street.",
      authorName: "Test Person (writer)",
      photoKey: null,
    });
    expect(await b.as("other").query(api.storyShare.card, { storyId })).toEqual(card);
  });

  it("refuses a removed story, a demo story and a story on a place that is not public", async () => {
    const { b, placeId } = await world();
    const removed = await tell(b, placeId as never);
    await b.as("writer").mutation(api.stories.remove, { storyId: removed });
    expect(await b.t.query(api.storyShare.card, { storyId: removed })).toBeNull();

    const demo = await tell(b, placeId as never);
    await b.run((ctx) => ctx.db.patch("story", demo, { isMock: true }));
    expect(await b.t.query(api.storyShare.card, { storyId: demo })).toBeNull();

    const hiddenPlace = await tell(b, placeId as never);
    expect(await b.t.query(api.storyShare.card, { storyId: hiddenPlace })).not.toBeNull();
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "draft" }));
    expect(await b.t.query(api.storyShare.card, { storyId: hiddenPlace })).toBeNull();
  });
});
