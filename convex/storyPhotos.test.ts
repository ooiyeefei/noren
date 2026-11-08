/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addClaim,
  addPerson,
  addPlace,
  errorCode,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as region from "./lib/region";

// The fake stands in for S3 itself: no test here can reach AWS, whatever the settings say.
const fake = vi.hoisted(() => ({
  removed: [] as string[],
  remove: vi.fn<(key: string) => Promise<void>>(),
}));
vi.mock("../src/lib/photos/s3-store", () => ({
  createS3PhotoStore: () => ({ remove: fake.remove }),
}));

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 6, 3, 0);
const INCOMING = /^incoming\/[0-9a-f]{32}\.jpg$/;
const FINAL = /^photos\/[0-9a-f]{32}\.jpg$/;

const STORAGE = {
  PHOTOS_S3_BUCKET: "fictional-photo-bucket",
  PHOTOS_S3_REGION: "ap-northeast-1",
  PHOTOS_S3_ACCESS_KEY_ID: "AKIAFICTIONAL",
  PHOTOS_S3_SECRET_ACCESS_KEY: "fictional-secret-value",
};

const { regionConfig } = region;
function regionWithPhotos(enabled: boolean) {
  const real = regionConfig("nagasaki");
  vi.spyOn(region, "regionConfig").mockReturnValue({
    ...real,
    photos: { ...real.photos, enabled },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  fake.removed.length = 0;
  fake.remove.mockReset();
  fake.remove.mockImplementation(async (key) => void fake.removed.push(key));
  for (const [name, value] of Object.entries(STORAGE)) vi.stubEnv(name, value);
  regionWithPhotos(true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function world() {
  const b = newBackend(modules);
  // A person's join date is when their row was made.
  vi.setSystemTime(NOW - 30 * DAY);
  const steward = await addPerson(b, "steward", "steward");
  const editor = await addPerson(b, "editor", "creator");
  const member = await addPerson(b, "member", "user");
  const other = await addPerson(b, "other", "user");
  await addPerson(b, "mock", "user", { isMock: true });
  const placeId = await addPlace(b, { createdBy: editor, visibility: "public" });
  vi.setSystemTime(NOW - 1 * DAY);
  const newcomer = await addPerson(b, "newcomer", "user");
  vi.setSystemTime(NOW);
  return { b, steward, editor, member, other, newcomer, placeId };
}

/** What the routes do for one picture, short of S3. */
async function stored(b: Backend, as: string, placeId: Id<"place">) {
  const { photoId } = await b.as(as).mutation(api.storyPhotos.beginUpload, { placeId });
  await b.as(as).mutation(api.storyPhotos.completeUpload, { photoId, width: 2048, height: 1536 });
  return photoId;
}

async function story(
  b: Backend,
  as: string,
  placeId: Id<"place">,
  photoIds: Id<"storyPhoto">[] = [],
) {
  return await b
    .as(as)
    .mutation(api.stories.add, { placeId, body: "A story.", lang: "en", photoIds });
}

async function photoRow(b: Backend, photoId: Id<"storyPhoto">) {
  return await b.run((ctx) => ctx.db.get("storyPhoto", photoId));
}

async function noPhotography(b: Backend, placeId: Id<"place">, status = "published" as const) {
  const reviewer = await b.run(async (ctx) => (await ctx.db.query("person").first())!._id);
  return await addClaim(b, {
    placeId,
    kind: "caution",
    cautionType: "no_photography",
    status,
    authorId: reviewer,
    reviewerId: reviewer,
  });
}

async function photosOnPage(
  b: Backend,
  placeId: Id<"place">,
  as?: string,
): Promise<Id<"storyPhoto">[]> {
  const viewer = as ? b.as(as) : b.t;
  const stories = await viewer.query(api.stories.listForPlace, { placeId });
  return stories.flatMap((entry) => entry.photos.map((photo) => photo._id));
}

async function queuedKeys(b: Backend) {
  const rows = await b.run((ctx) => ctx.db.query("photoObjectRemoval").take(100));
  return rows.map((row) => row.key).sort();
}

describe("switched off", () => {
  it("the region's flag refuses every step, and nothing is recorded", async () => {
    const { b, placeId } = await world();
    regionWithPhotos(false);
    expect(await errorCode(b.as("member").mutation(api.storyPhotos.beginUpload, { placeId }))).toBe(
      "forbidden",
    );
    expect(await b.run((ctx) => ctx.db.query("storyPhoto").take(1))).toEqual([]);
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: false,
    });
  });

  it("missing storage settings on Convex refuse too, so nothing is taken that can't be deleted", async () => {
    const { b, placeId } = await world();
    vi.stubEnv("PHOTOS_S3_SECRET_ACCESS_KEY", "");
    expect(await errorCode(b.as("member").mutation(api.storyPhotos.beginUpload, { placeId }))).toBe(
      "forbidden",
    );
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: false,
    });
  });

  it("a story without photos works exactly as before", async () => {
    const { b, placeId } = await world();
    regionWithPhotos(false);
    await b.as("member").mutation(api.stories.add, { placeId, body: "A story.", lang: "en" });
    const [view] = await b.t.query(api.stories.listForPlace, { placeId });
    expect(view!.photos).toEqual([]);
  });

  it("refuses photo ids on a story, and the story with them", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    regionWithPhotos(false);
    expect(await errorCode(story(b, "member", placeId, [photoId]))).toBe("forbidden");
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);
  });

  it("hides photos already on a story when it is switched off again, but keeps them", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    await story(b, "member", placeId, [photoId]);
    regionWithPhotos(false);
    expect(await photosOnPage(b, placeId)).toEqual([]);
    expect(await photoRow(b, photoId)).not.toBeNull();
  });
});

describe("who may upload", () => {
  // A query may not read the clock, so it says until when and the page compares.
  it("tells a member the page's limits and until when their photos wait", async () => {
    const { b, placeId, newcomer, member } = await world();
    const until = async (id: Id<"person">) =>
      (await b.run((ctx) => ctx.db.get("person", id)))!._creationTime + 7 * DAY;
    expect(await b.as("newcomer").query(api.storyPhotos.forPlace, { placeId })).toEqual({
      allowed: true,
      maxPerStory: 4,
      waitsUntil: await until(newcomer),
    });
    const established = await b.as("member").query(api.storyPhotos.forPlace, { placeId });
    expect(established.waitsUntil).toBe(await until(member));
    expect(established.waitsUntil).toBeLessThan(NOW);
    for (const as of ["editor", "steward"]) {
      expect(await b.as(as).query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
        allowed: true,
        waitsUntil: null,
      });
    }
  });

  it("refuses someone signed out", async () => {
    const { b, placeId } = await world();
    expect(await errorCode(b.t.mutation(api.storyPhotos.beginUpload, { placeId }))).toBe(
      "unauthenticated",
    );
    expect(await b.t.query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: false,
    });
  });

  it("refuses a demo account", async () => {
    const { b, placeId } = await world();
    expect(await errorCode(b.as("mock").mutation(api.storyPhotos.beginUpload, { placeId }))).toBe(
      "forbidden",
    );
    expect(await b.as("mock").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: false,
    });
  });

  it("refuses a fictional place", async () => {
    const { b, steward } = await world();
    const demo = await addPlace(b, { createdBy: steward, visibility: "demo_public", isMock: true });
    expect(
      await errorCode(b.as("member").mutation(api.storyPhotos.beginUpload, { placeId: demo })),
    ).toBe("forbidden");
  });

  it("answers not found for a place the member can't read", async () => {
    const { b, editor } = await world();
    const draft = await addPlace(b, { createdBy: editor });
    expect(
      await errorCode(b.as("member").mutation(api.storyPhotos.beginUpload, { placeId: draft })),
    ).toBe("not_found");
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId: draft })).toMatchObject({
      allowed: false,
    });
  });

  it("Convex chooses both keys, at random, and neither comes from the caller", async () => {
    const { b, placeId } = await world();
    const a = await b.as("member").mutation(api.storyPhotos.beginUpload, { placeId });
    const b2 = await b.as("member").mutation(api.storyPhotos.beginUpload, { placeId });
    expect(a.incomingKey).toMatch(INCOMING);
    expect(b2.incomingKey).toMatch(INCOMING);
    expect(a.incomingKey).not.toBe(b2.incomingKey);
    const row = await photoRow(b, a.photoId);
    expect(row!.key).toMatch(FINAL);
    expect(row!.key.slice(7)).not.toBe(a.incomingKey.slice(9));
    expect(row!.status).toBe("uploading");
  });
});

describe("the daily limit", () => {
  it("is 5 for a new member and 30 otherwise, and a steward has none", async () => {
    const { b, placeId } = await world();
    const begin = (as: string) => b.as(as).mutation(api.storyPhotos.beginUpload, { placeId });
    for (let i = 0; i < 5; i++) await begin("newcomer");
    expect(await errorCode(begin("newcomer"))).toBe("rate_limited");
    for (let i = 0; i < 30; i++) await begin("member");
    expect(await errorCode(begin("member"))).toBe("rate_limited");
    for (let i = 0; i < 31; i++) await begin("steward");
  });

  it("gives a creator the higher limit from their first day, as other limits do", async () => {
    const { b, placeId } = await world();
    await addPerson(b, "freshCreator", "creator");
    const begin = () => b.as("freshCreator").mutation(api.storyPhotos.beginUpload, { placeId });
    for (let i = 0; i < 6; i++) await begin();
  });

  it("starts over the next day", async () => {
    const { b, placeId } = await world();
    const begin = () => b.as("newcomer").mutation(api.storyPhotos.beginUpload, { placeId });
    for (let i = 0; i < 5; i++) await begin();
    vi.setSystemTime(NOW + DAY);
    await begin();
  });
});

describe("the second route's ticket", () => {
  it("gives the keys to the member who began the upload", async () => {
    const { b, placeId } = await world();
    const { photoId, incomingKey } = await b
      .as("member")
      .mutation(api.storyPhotos.beginUpload, { placeId });
    const ticket = await b.as("member").query(api.storyPhotos.uploadTicket, { photoId });
    expect(ticket.incomingKey).toBe(incomingKey);
    expect(ticket.key).toMatch(FINAL);
  });

  it("answers not found to anyone else, even a steward, so a key is never handed around", async () => {
    const { b, placeId } = await world();
    const { photoId } = await b.as("member").mutation(api.storyPhotos.beginUpload, { placeId });
    for (const as of ["other", "steward"]) {
      expect(await errorCode(b.as(as).query(api.storyPhotos.uploadTicket, { photoId }))).toBe(
        "not_found",
      );
      expect(
        await errorCode(
          b.as(as).mutation(api.storyPhotos.completeUpload, { photoId, width: 10, height: 10 }),
        ),
      ).toBe("not_found");
    }
    expect((await photoRow(b, photoId))!.status).toBe("uploading");
  });

  it("is spent once the upload is finished", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    expect(await errorCode(b.as("member").query(api.storyPhotos.uploadTicket, { photoId }))).toBe(
      "conflict",
    );
  });

  it("finishing twice changes nothing", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    await b.as("member").mutation(api.storyPhotos.completeUpload, { photoId, width: 1, height: 1 });
    expect(await photoRow(b, photoId)).toMatchObject({
      status: "unattached",
      width: 2048,
      height: 1536,
    });
  });

  it.each([
    [0, 10],
    [10, 0],
    [2049, 10],
    [10, 1.5],
  ])("refuses a size of %s by %s", async (width, height) => {
    const { b, placeId } = await world();
    const { photoId } = await b.as("member").mutation(api.storyPhotos.beginUpload, { placeId });
    expect(
      await errorCode(
        b.as("member").mutation(api.storyPhotos.completeUpload, { photoId, width, height }),
      ),
    ).toBe("invalid_input");
  });
});

describe("attaching to a story", () => {
  it("puts an established member's photos live at once, in the order picked", async () => {
    const { b, placeId } = await world();
    const first = await stored(b, "member", placeId);
    const second = await stored(b, "member", placeId);
    const storyId = await story(b, "member", placeId, [second, first]);
    expect(await photoRow(b, first)).toMatchObject({ status: "live", storyId });
    const [view] = await b.t.query(api.stories.listForPlace, { placeId });
    expect(view!.photos.map((photo) => photo._id)).toEqual([second, first]);
    const row = await photoRow(b, second);
    expect(view!.photos[0]).toEqual({
      _id: second,
      key: row!.key,
      width: 2048,
      height: 1536,
      waiting: false,
      canRemove: false,
    });
  });

  it("keeps the story's text required", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    expect(
      await errorCode(
        b
          .as("member")
          .mutation(api.stories.add, { placeId, body: "   ", lang: "en", photoIds: [photoId] }),
      ),
    ).toBe("invalid_input");
    expect((await photoRow(b, photoId))!.status).toBe("unattached");
  });

  it("refuses a fifth photo and rolls back the story", async () => {
    const { b, placeId } = await world();
    const ids: Id<"storyPhoto">[] = [];
    for (let i = 0; i < 5; i++) ids.push(await stored(b, "member", placeId));
    expect(await errorCode(story(b, "member", placeId, ids))).toBe("invalid_input");
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);
    expect((await photoRow(b, ids[0]!))!.status).toBe("unattached");
    await story(b, "member", placeId, ids.slice(0, 4));
    expect(await photosOnPage(b, placeId)).toHaveLength(4);
  });

  it("refuses the same photo twice", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    expect(await errorCode(story(b, "member", placeId, [photoId, photoId]))).toBe("invalid_input");
  });

  it("refuses someone else's photo", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    expect(await errorCode(story(b, "other", placeId, [photoId]))).toBe("invalid_input");
    expect((await photoRow(b, photoId))!.status).toBe("unattached");
  });

  it("refuses a photo meant for another place", async () => {
    const { b, placeId, editor } = await world();
    const elsewhere = await addPlace(b, { createdBy: editor, visibility: "public" });
    const photoId = await stored(b, "member", elsewhere);
    expect(await errorCode(story(b, "member", placeId, [photoId]))).toBe("invalid_input");
  });

  it("refuses a photo still uploading, which has not been checked", async () => {
    const { b, placeId } = await world();
    const { photoId } = await b.as("member").mutation(api.storyPhotos.beginUpload, { placeId });
    expect(await errorCode(story(b, "member", placeId, [photoId]))).toBe("invalid_input");
  });

  it("refuses a photo already on a story", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    await story(b, "member", placeId, [photoId]);
    expect(await errorCode(story(b, "member", placeId, [photoId]))).toBe("invalid_input");
  });
});

describe("adding photos to a story that is already up", () => {
  const add = (b: Backend, storyId: Id<"story">, photoIds: Id<"storyPhoto">[]) =>
    b.t.mutation(internal.storyPhotos.attachToStory, { storyId, photoIds });

  it("puts the writer's photos after the ones it has, live, and records it", async () => {
    const { b, placeId } = await world();
    const first = await stored(b, "member", placeId);
    const storyId = await story(b, "member", placeId, [first]);
    const second = await stored(b, "member", placeId);
    const third = await stored(b, "member", placeId);
    await add(b, storyId, [second, third]);
    expect(await photosOnPage(b, placeId)).toEqual([first, second, third]);
    expect(await photoRow(b, third)).toMatchObject({ status: "live", storyId, position: 2 });
    const audit = await b.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.filter((row) => row.action === "photo.attachToStory")).toHaveLength(1);
  });

  it("adds to a story that had none", async () => {
    const { b, placeId } = await world();
    const storyId = await story(b, "member", placeId);
    const photoId = await stored(b, "member", placeId);
    await add(b, storyId, [photoId]);
    expect(await photoRow(b, photoId)).toMatchObject({ status: "live", storyId, position: 0 });
  });

  it("counts the photos already there towards the limit, and changes nothing when refused", async () => {
    const { b, placeId } = await world();
    const ids: Id<"storyPhoto">[] = [];
    for (let i = 0; i < 3; i++) ids.push(await stored(b, "member", placeId));
    const storyId = await story(b, "member", placeId, ids);
    const extra = [await stored(b, "member", placeId), await stored(b, "member", placeId)];
    expect(await errorCode(add(b, storyId, extra))).toBe("invalid_input");
    expect((await photoRow(b, extra[0]!))!.status).toBe("unattached");
    await add(b, storyId, extra.slice(0, 1));
    expect(await photosOnPage(b, placeId)).toHaveLength(4);
  });

  it("refuses someone else's photo, or one meant for another place", async () => {
    const { b, placeId, editor } = await world();
    const storyId = await story(b, "member", placeId);
    expect(await errorCode(add(b, storyId, [await stored(b, "other", placeId)]))).toBe(
      "invalid_input",
    );
    const elsewhere = await addPlace(b, { createdBy: editor, visibility: "public" });
    expect(await errorCode(add(b, storyId, [await stored(b, "member", elsewhere)]))).toBe(
      "invalid_input",
    );
  });

  it("a new member's added photos wait for a steward, as on a new story", async () => {
    const { b, placeId } = await world();
    const storyId = await story(b, "newcomer", placeId);
    const photoId = await stored(b, "newcomer", placeId);
    await add(b, storyId, [photoId]);
    expect((await photoRow(b, photoId))!.status).toBe("waiting");
  });

  it("refuses a hidden story", async () => {
    const { b, placeId } = await world();
    const storyId = await story(b, "member", placeId);
    await b.run((ctx) => ctx.db.patch("story", storyId, { status: "hidden" }));
    expect(await errorCode(add(b, storyId, [await stored(b, "member", placeId)]))).toBe(
      "not_found",
    );
  });
});

describe("a new member's photos wait", () => {
  async function waiting() {
    const w = await world();
    const photoId = await stored(w.b, "newcomer", w.placeId);
    const storyId = await story(w.b, "newcomer", w.placeId, [photoId]);
    return { ...w, photoId, storyId };
  }

  it("only they and stewards see it", async () => {
    const { b, placeId, photoId } = await waiting();
    expect((await photoRow(b, photoId))!.status).toBe("waiting");
    expect(await photosOnPage(b, placeId)).toEqual([]);
    expect(await photosOnPage(b, placeId, "other")).toEqual([]);
    expect(await photosOnPage(b, placeId, "editor")).toEqual([]);
    expect(await photosOnPage(b, placeId, "newcomer")).toEqual([photoId]);
    expect(await photosOnPage(b, placeId, "steward")).toEqual([photoId]);
    const [mine] = await b.as("newcomer").query(api.stories.listForPlace, { placeId });
    expect(mine!.photos[0]!.waiting).toBe(true);
  });

  it("the story itself shows to everyone meanwhile", async () => {
    const { b, placeId } = await waiting();
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toHaveLength(1);
  });

  it("stops being new after the region's days", async () => {
    const { b, placeId } = await world();
    vi.setSystemTime(NOW + 7 * DAY);
    const photoId = await stored(b, "newcomer", placeId);
    await story(b, "newcomer", placeId, [photoId]);
    expect((await photoRow(b, photoId))!.status).toBe("live");
  });

  it("a creator's or a steward's photos never wait", async () => {
    const { b, placeId } = await world();
    await addPerson(b, "freshCreator", "creator");
    await addPerson(b, "freshSteward", "steward");
    for (const as of ["freshCreator", "freshSteward"]) {
      const photoId = await stored(b, as, placeId);
      await story(b, as, placeId, [photoId]);
      expect((await photoRow(b, photoId))!.status).toBe("live");
    }
  });

  it("a steward sees the queue with the place, the words and the name", async () => {
    const { b, photoId } = await waiting();
    const { photos, removalsFailing } = await b
      .as("steward")
      .query(api.storyPhotos.listWaiting, {});
    expect(removalsFailing).toBe(0);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      _id: photoId,
      authorName: "Test Person (newcomer)",
      storyBody: "A story.",
      width: 2048,
      height: 1536,
    });
    expect(photos[0]!.placeNames.length).toBeGreaterThan(0);
    expect(photos[0]!.key).toMatch(FINAL);
  });

  it("no one else can read the queue", async () => {
    const { b } = await waiting();
    expect(await errorCode(b.t.query(api.storyPhotos.listWaiting, {}))).toBe("unauthenticated");
    for (const as of ["newcomer", "editor", "member"]) {
      expect(await errorCode(b.as(as).query(api.storyPhotos.listWaiting, {}))).toBe("forbidden");
    }
  });

  it("the queue leaves out a photo with no story yet, which the cron will remove", async () => {
    const { b, placeId } = await world();
    await stored(b, "newcomer", placeId);
    const { photos } = await b.as("steward").query(api.storyPhotos.listWaiting, {});
    expect(photos).toEqual([]);
  });

  it("a steward approves it, it goes live and the approval is audited", async () => {
    const { b, placeId, photoId, steward } = await waiting();
    await b.as("steward").mutation(api.storyPhotos.approve, { photoId });
    expect(await photosOnPage(b, placeId)).toEqual([photoId]);
    const [view] = await b.t.query(api.stories.listForPlace, { placeId });
    expect(view!.photos[0]!.waiting).toBe(false);
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits).toMatchObject([
      { action: "photo.approve", actorPersonId: steward, targetId: photoId },
    ]);
    const { photos } = await b.as("steward").query(api.storyPhotos.listWaiting, {});
    expect(photos).toEqual([]);
  });

  it("no one else can approve, including the writer", async () => {
    const { b, photoId } = await waiting();
    for (const as of ["newcomer", "editor", "member"]) {
      expect(await errorCode(b.as(as).mutation(api.storyPhotos.approve, { photoId }))).toBe(
        "forbidden",
      );
    }
    expect((await photoRow(b, photoId))!.status).toBe("waiting");
  });

  it("a demo steward can't approve or remove a real member's photo, or see it", async () => {
    const { b, placeId, photoId } = await waiting();
    await addPerson(b, "demoSteward", "steward", { isMock: true });
    expect(
      await errorCode(b.as("demoSteward").mutation(api.storyPhotos.approve, { photoId })),
    ).toBe("forbidden");
    expect(await errorCode(b.as("demoSteward").mutation(api.storyPhotos.remove, { photoId }))).toBe(
      "forbidden",
    );
    expect(await photoRow(b, photoId)).not.toBeNull();
    // An empty list and no error, because a refusal here would take down the whole steward page.
    expect(await b.as("demoSteward").query(api.storyPhotos.listWaiting, {})).toEqual({
      photos: [],
      removalsFailing: 0,
    });
    expect(await photosOnPage(b, placeId, "demoSteward")).toEqual([]);
  });

  it("approving a photo that is not waiting is a conflict", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    expect(await errorCode(b.as("steward").mutation(api.storyPhotos.approve, { photoId }))).toBe(
      "conflict",
    );
  });
});

describe("removal", () => {
  async function livePhoto() {
    const w = await world();
    const photoId = await stored(w.b, "member", w.placeId);
    const storyId = await story(w.b, "member", w.placeId, [photoId]);
    const row = (await photoRow(w.b, photoId))!;
    return { ...w, photoId, storyId, row };
  }

  it("takes the photo off the page at once and queues both objects for deletion", async () => {
    const { b, placeId, photoId, row } = await livePhoto();
    await b.as("member").mutation(api.storyPhotos.remove, { photoId });
    expect(await photosOnPage(b, placeId)).toEqual([]);
    expect(await photoRow(b, photoId)).toBeNull();
    expect(await queuedKeys(b)).toEqual([row.incomingKey, row.key].sort());
  });

  it("really deletes the objects from storage", async () => {
    const { b, photoId, row } = await livePhoto();
    await b.as("member").mutation(api.storyPhotos.remove, { photoId });
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.removed.sort()).toEqual([row.incomingKey, row.key].sort());
    expect(await queuedKeys(b)).toEqual([]);
  });

  it("the writer, the place's editor and a steward may; no one else may", async () => {
    const { b, placeId } = await world();
    const add = async () => {
      const photoId = await stored(b, "member", placeId);
      await story(b, "member", placeId, [photoId]);
      return photoId;
    };
    const first = await add();
    for (const as of ["other", "newcomer"]) {
      expect(await errorCode(b.as(as).mutation(api.storyPhotos.remove, { photoId: first }))).toBe(
        "forbidden",
      );
    }
    expect(await errorCode(b.t.mutation(api.storyPhotos.remove, { photoId: first }))).toBe(
      "unauthenticated",
    );
    expect(await photoRow(b, first)).not.toBeNull();
    await b.as("member").mutation(api.storyPhotos.remove, { photoId: first });
    const second = await add();
    await b.as("editor").mutation(api.storyPhotos.remove, { photoId: second });
    const third = await add();
    await b.as("steward").mutation(api.storyPhotos.remove, { photoId: third });
    expect(await photosOnPage(b, placeId)).toEqual([]);
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits.map((entry) => entry.action)).toEqual(["photo.remove"]);
  });

  it("each view says who may remove", async () => {
    const { b, placeId } = await livePhoto();
    const canRemove = async (as?: string) => {
      const viewer = as ? b.as(as) : b.t;
      const [view] = await viewer.query(api.stories.listForPlace, { placeId });
      return view!.photos[0]!.canRemove;
    };
    expect(await canRemove()).toBe(false);
    expect(await canRemove("other")).toBe(false);
    expect(await canRemove("member")).toBe(true);
    expect(await canRemove("editor")).toBe(true);
    expect(await canRemove("steward")).toBe(true);
  });

  it("removing a story removes its photos and their objects", async () => {
    const { b, placeId } = await world();
    const a = await stored(b, "member", placeId);
    const c = await stored(b, "member", placeId);
    const storyId = await story(b, "member", placeId, [a, c]);
    const keys = [(await photoRow(b, a))!.key, (await photoRow(b, c))!.key];
    await b.as("member").mutation(api.stories.remove, { storyId });
    expect(await photoRow(b, a)).toBeNull();
    expect(await photoRow(b, c)).toBeNull();
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.removed).toEqual(expect.arrayContaining(keys));
  });

  it("keeps retrying when storage fails, and tells a steward", async () => {
    const { b, photoId, row } = await livePhoto();
    fake.remove.mockRejectedValue(Object.assign(new Error("fictional"), { name: "SlowDown" }));
    await b.as("member").mutation(api.storyPhotos.remove, { photoId });
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await queuedKeys(b)).toEqual([row.incomingKey, row.key].sort());
    expect(vi.mocked(console.error).mock.calls.join(" ")).toContain("SlowDown");
    const failing = await b.as("steward").query(api.storyPhotos.listWaiting, {});
    expect(failing.removalsFailing).toBe(2);

    // Not due yet: the cron leaves a failing row alone until its next attempt.
    fake.remove.mockReset();
    fake.remove.mockImplementation(async (key) => void fake.removed.push(key));
    await b.t.action(internal.storyPhotoActions.removeObjects, {});
    expect(fake.removed).toEqual([]);

    vi.setSystemTime(NOW + 60 * 60 * 1000);
    await b.t.action(internal.storyPhotoActions.removeObjects, {});
    expect(fake.removed.sort()).toEqual([row.incomingKey, row.key].sort());
    expect(await queuedKeys(b)).toEqual([]);
    const fixed = await b.as("steward").query(api.storyPhotos.listWaiting, {});
    expect(fixed.removalsFailing).toBe(0);
  });

  it("keeps the queue when Convex has no storage settings, and says so by name", async () => {
    const { b, photoId, row } = await livePhoto();
    vi.stubEnv("PHOTOS_S3_BUCKET", "");
    await b.as("member").mutation(api.storyPhotos.remove, { photoId });
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.removed).toEqual([]);
    expect(await queuedKeys(b)).toEqual([row.incomingKey, row.key].sort());
    expect(vi.mocked(console.error).mock.calls.join(" ")).toContain("settings");
  });

  it("works through a long queue in batches", async () => {
    const { b } = await world();
    await b.run(async (ctx) => {
      for (let i = 0; i < 60; i++)
        await ctx.db.insert("photoObjectRemoval", {
          key: `photos/${i}.jpg`,
          attempts: 0,
          nextAttemptAt: 0,
        });
    });
    await b.t.action(internal.storyPhotoActions.removeObjects, {});
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.removed).toHaveLength(60);
    expect(await queuedKeys(b)).toEqual([]);
  });

  it("a removal row deleted meanwhile does not fail the run", async () => {
    const { b } = await world();
    const id = await b.run((ctx) =>
      ctx.db.insert("photoObjectRemoval", { key: "photos/a.jpg", attempts: 0, nextAttemptAt: 0 }),
    );
    await b.run((ctx) => ctx.db.delete("photoObjectRemoval", id));
    await b.t.mutation(internal.storyPhotos.settleRemovals, {
      done: [id],
      failed: [id],
      now: NOW,
    });
  });

  it("does nothing, and reads no settings, when the queue is empty", async () => {
    const { b } = await world();
    vi.stubEnv("PHOTOS_S3_BUCKET", "");
    await b.t.action(internal.storyPhotoActions.removeObjects, {});
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("deleting an account", () => {
  const finish = (b: Backend) => b.t.finishAllScheduledFunctions(vi.runAllTimers);

  it("removes every photo of theirs in every state, its files too, and leaves others' alone", async () => {
    const { b, placeId } = await world();
    const attached = await stored(b, "member", placeId);
    await story(b, "member", placeId, [attached]);
    const unattached = await stored(b, "member", placeId);
    const { photoId: uploading } = await b
      .as("member")
      .mutation(api.storyPhotos.beginUpload, { placeId });
    const theirs = await stored(b, "other", placeId);

    const keys = [];
    for (const id of [attached, unattached, uploading]) {
      const row = (await photoRow(b, id))!;
      keys.push(row.key, row.incomingKey);
    }
    await b.as("member").mutation(api.people.deleteMine, {});
    await finish(b);

    for (const id of [attached, unattached, uploading]) expect(await photoRow(b, id)).toBeNull();
    expect(await photoRow(b, theirs)).not.toBeNull();
    expect(fake.removed.sort()).toEqual(keys.sort());
    expect(await queuedKeys(b)).toEqual([]);
  });

  it("keeps a removal waiting while storage is down, so no file is forgotten", async () => {
    const { b, placeId } = await world();
    const photo = await stored(b, "member", placeId);
    const row = (await photoRow(b, photo))!;
    fake.remove.mockRejectedValue(new Error("fictional outage"));

    await b.as("member").mutation(api.people.deleteMine, {});
    await finish(b);

    expect(await photoRow(b, photo)).toBeNull();
    expect(await queuedKeys(b)).toEqual([row.key, row.incomingKey].sort());
  });

  it("asks storage for nothing when the person has no photos", async () => {
    const { b } = await world();
    await b.as("member").mutation(api.people.deleteMine, {});
    await finish(b);
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("goes on past one transaction's worth of photos", async () => {
    const { b, member, placeId } = await world();
    await b.run(async (ctx) => {
      for (let i = 0; i < 120; i++)
        await ctx.db.insert("storyPhoto", {
          placeId,
          uploaderPersonId: member,
          status: "unattached",
          incomingKey: `incoming/${i}.jpg`,
          key: `photos/${i}.jpg`,
        });
    });
    await b.as("member").mutation(api.people.deleteMine, {});
    await finish(b);
    expect(await b.run((ctx) => ctx.db.query("storyPhoto").take(1))).toEqual([]);
    // Overlapping runs may delete a key twice, which S3 ignores. Every key must go at least once.
    expect(new Set(fake.removed).size).toBe(240);
    expect(await queuedKeys(b)).toEqual([]);
  });
});

describe("the cron for photos left behind", () => {
  it("removes unattached and unfinished photos after about a day, and their objects", async () => {
    const { b, placeId } = await world();
    const unattached = await stored(b, "member", placeId);
    const { photoId: uploading } = await b
      .as("member")
      .mutation(api.storyPhotos.beginUpload, { placeId });
    const keptOnStory = await stored(b, "member", placeId);
    await story(b, "member", placeId, [keptOnStory]);
    const newcomerWaiting = await stored(b, "newcomer", placeId);
    await story(b, "newcomer", placeId, [newcomerWaiting]);

    vi.setSystemTime(NOW + 23 * 60 * 60 * 1000);
    await b.t.mutation(internal.storyPhotos.sweepUnattached, {});
    expect(await photoRow(b, unattached)).not.toBeNull();

    const rows = [(await photoRow(b, unattached))!, (await photoRow(b, uploading))!];
    vi.setSystemTime(NOW + 25 * 60 * 60 * 1000);
    await b.t.mutation(internal.storyPhotos.sweepUnattached, {});
    expect(await photoRow(b, unattached)).toBeNull();
    expect(await photoRow(b, uploading)).toBeNull();
    expect(await photoRow(b, keptOnStory)).not.toBeNull();
    expect(await photoRow(b, newcomerWaiting)).not.toBeNull();
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fake.removed.sort()).toEqual(rows.flatMap((r) => [r.key, r.incomingKey]).sort());
  });

  it("is bounded: a big backlog finishes over several runs", async () => {
    const { b, member, placeId } = await world();
    await b.run(async (ctx) => {
      for (let i = 0; i < 70; i++)
        await ctx.db.insert("storyPhoto", {
          placeId,
          uploaderPersonId: member,
          status: "unattached",
          incomingKey: `incoming/${i}.jpg`,
          key: `photos/${i}.jpg`,
        });
    });
    vi.setSystemTime(NOW + 2 * DAY);
    await b.t.mutation(internal.storyPhotos.sweepUnattached, {});
    expect(await b.run((ctx) => ctx.db.query("storyPhoto").take(100))).toHaveLength(20);
    await b.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await b.run((ctx) => ctx.db.query("storyPhoto").take(100))).toEqual([]);
  });
});

describe("an owner who asks for no photography", () => {
  it.each(["owner_confirmed", "published"] as const)(
    "when the caution is %s: no control, and every step refuses",
    async (status) => {
      const { b, placeId } = await world();
      const before = await stored(b, "member", placeId);
      const { photoId: inFlight } = await b
        .as("member")
        .mutation(api.storyPhotos.beginUpload, { placeId });
      await noPhotography(b, placeId, status as "published");
      expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
        allowed: false,
      });
      expect(
        await errorCode(b.as("member").mutation(api.storyPhotos.beginUpload, { placeId })),
      ).toBe("forbidden");
      expect(
        await errorCode(b.as("member").query(api.storyPhotos.uploadTicket, { photoId: inFlight })),
      ).toBe("forbidden");
      expect(await errorCode(story(b, "member", placeId, [before]))).toBe("forbidden");
    },
  );

  it("a steward is refused as well", async () => {
    const { b, placeId } = await world();
    await noPhotography(b, placeId);
    expect(
      await errorCode(b.as("steward").mutation(api.storyPhotos.beginUpload, { placeId })),
    ).toBe("forbidden");
  });

  it("a caution the owner has not confirmed changes nothing", async () => {
    const { b, placeId } = await world();
    const author = await b.run(async (ctx) => (await ctx.db.query("person").first())!._id);
    await addClaim(b, {
      placeId,
      kind: "caution",
      cautionType: "no_photography",
      authorId: author,
    });
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: true,
    });
  });

  it("another caution changes nothing", async () => {
    const { b, placeId } = await world();
    const reviewer = await b.run(async (ctx) => (await ctx.db.query("person").first())!._id);
    await addClaim(b, {
      placeId,
      kind: "caution",
      cautionType: "cash_only",
      status: "published",
      authorId: reviewer,
      reviewerId: reviewer,
    });
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: true,
    });
  });

  it("a demo claim on a real place changes nothing", async () => {
    const { b, placeId } = await world();
    const reviewer = await b.run(async (ctx) => (await ctx.db.query("person").first())!._id);
    await addClaim(b, {
      placeId,
      kind: "caution",
      cautionType: "no_photography",
      status: "published",
      authorId: reviewer,
      reviewerId: reviewer,
      isMock: true,
    });
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: true,
    });
  });

  it("another place's caution changes nothing", async () => {
    const { b, placeId, editor } = await world();
    const elsewhere = await addPlace(b, { createdBy: editor, visibility: "public" });
    await noPhotography(b, elsewhere);
    expect(await b.as("member").query(api.storyPhotos.forPlace, { placeId })).toMatchObject({
      allowed: true,
    });
  });

  it("photos already there leave public view, stay with their writer and stewards, and can be removed", async () => {
    const { b, placeId } = await world();
    const photoId = await stored(b, "member", placeId);
    await story(b, "member", placeId, [photoId]);
    await noPhotography(b, placeId);
    expect(await photosOnPage(b, placeId)).toEqual([]);
    expect(await photosOnPage(b, placeId, "other")).toEqual([]);
    expect(await photosOnPage(b, placeId, "editor")).toEqual([]);
    expect(await photosOnPage(b, placeId, "member")).toEqual([photoId]);
    expect(await photosOnPage(b, placeId, "steward")).toEqual([photoId]);
    await b.as("member").mutation(api.storyPhotos.remove, { photoId });
    expect(await photoRow(b, photoId)).toBeNull();
  });
});
