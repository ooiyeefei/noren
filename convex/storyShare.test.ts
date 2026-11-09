/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getRegionConfig } from "../src/lib/region/registry";
import {
  addOwner,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const sharing = () => getRegionConfig("nagasaki")!.sharing;

async function world() {
  const b = newBackend(modules);
  await addPerson(b, "writer", "user", { joinedDaysAgo: 30 });
  const steward = await addPerson(b, "steward", "steward");
  await addPerson(b, "other", "user");
  await addPerson(b, "owner", "user");
  await addPerson(b, "rival", "user");
  const editor = await addPerson(b, "editor", "creator");
  const placeId = await addPlace(b, { createdBy: editor, visibility: "public" });
  const ownerId = await b.run(async (ctx) => {
    const person = await ctx.db
      .query("person")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", "https://clerk.test.invalid|owner"),
      )
      .unique();
    return person!._id;
  });
  await addOwner(b, placeId, ownerId, steward);
  // A verified owner of some other place has no say here.
  const rivalId = await b.run(async (ctx) => {
    const person = await ctx.db
      .query("person")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", "https://clerk.test.invalid|rival"),
      )
      .unique();
    return person!._id;
  });
  const elsewhere = await addPlace(b, { createdBy: editor, visibility: "public" });
  await addOwner(b, elsewhere, rivalId, steward);
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

  it("is audited when ticked in the form, without the story's words", async () => {
    const { b, placeId } = await world();
    const ticked = await tell(b, placeId as never, true);
    await tell(b, placeId as never);
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(audits.map((a) => [a.action, a.targetType, a.targetId, a.actorKind, a.diff])).toEqual([
      ["story.share_consent_given", "story", ticked, "person", { shareConsent: true }],
    ]);
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

describe("changing the tick on a story already written", () => {
  const auditsOf = (b: Awaited<ReturnType<typeof world>>["b"]) =>
    b.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(50)).map((a) => [a.action, a.diff, a.actorKind]),
    );

  it("starts off for a story written without it, and the writer turns it on and off, each time audited", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never);
    const optedIn = () =>
      b
        .as("writer")
        .query(api.storyShare.kit, { storyId })
        .then((kit) => kit?.optedIn);
    expect(await optedIn()).toBe(false);
    await b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: true });
    expect(await optedIn()).toBe(true);
    await b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: false });
    expect(await optedIn()).toBe(false);
    expect(await auditsOf(b)).toEqual([
      ["story.share_consent_given", { shareConsent: true }, "person"],
      ["story.share_consent_withdrawn", { shareConsent: false }, "person"],
    ]);
  });

  it("changes and records nothing when the story is already as asked", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    const before = (await b.run((ctx) => ctx.db.get("story", storyId)))!.shareConsentAt;
    await b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: true });
    expect((await b.run((ctx) => ctx.db.get("story", storyId)))!.shareConsentAt).toBe(before);
    const plain = await tell(b, placeId as never);
    await b.as("writer").mutation(api.storyShare.setShareConsent, { storyId: plain, on: false });
    expect(await auditsOf(b)).toHaveLength(1);
  });

  it("is the writer's alone: not the owner, a steward, the place's editor, another member or a visitor", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    for (const who of ["owner", "steward", "editor", "other", "rival"]) {
      for (const on of [true, false])
        expect(
          await errorCode(b.as(who).mutation(api.storyShare.setShareConsent, { storyId, on })),
        ).toBe("forbidden");
    }
    await expect(
      b.t.mutation(api.storyShare.setShareConsent, { storyId, on: false }),
    ).rejects.toBeDefined();
    expect((await b.run((ctx) => ctx.db.get("story", storyId)))!.shareConsentAt).toEqual(
      expect.any(Number),
    );
    expect(await auditsOf(b)).toHaveLength(1);
  });

  it("is refused for turning on while the region does not offer it, and for a story taken down", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never);
    sharing().norenAccount = false;
    expect(
      await errorCode(
        b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: true }),
      ),
    ).toBe("invalid_input");
    sharing().norenAccount = true;
    await b.as("writer").mutation(api.stories.remove, { storyId });
    expect(
      await errorCode(
        b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: true }),
      ),
    ).toBe("conflict");
    expect(
      await errorCode(
        b
          .as("writer")
          .mutation(api.storyShare.setShareConsent, { storyId: "nope" as never, on: true }),
      ),
    ).toBeDefined();
  });

  it("can always be turned off, even after the region stops offering it", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    sharing().norenAccount = false;
    await b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: false });
    expect((await b.run((ctx) => ctx.db.get("story", storyId)))!.shareConsentAt).toBeUndefined();
  });
});

describe("who has the Instagram kit", () => {
  const kitFor = (b: Awaited<ReturnType<typeof world>>["b"], who: string | null, storyId: never) =>
    (who === null ? b.t : b.as(who)).query(api.storyShare.kit, { storyId });
  const everyone = ["writer", "owner", "steward", "editor", "other", "rival", null] as const;

  it("is the writer's for their own story, ticked or not, and nobody else's while it is not ticked", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never);
    const seen = await Promise.all(everyone.map((who) => kitFor(b, who, storyId as never)));
    expect(seen.map((kit) => kit?.viewer ?? null)).toEqual([
      "writer",
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(seen[0]).toMatchObject({ optedIn: false, canOptIn: true });
  });

  it("goes to the place's verified owner and to a steward, and no one else, once the writer ticks it", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    const seen = await Promise.all(everyone.map((who) => kitFor(b, who, storyId as never)));
    expect(seen.map((kit) => kit?.viewer ?? null)).toEqual([
      "writer",
      "owner",
      "steward",
      null,
      null,
      null,
      null,
    ]);
    expect(seen.every((kit) => kit === null || kit.optedIn)).toBe(true);
  });

  it("goes away for the owner and the steward the moment the writer turns it off", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    expect(await kitFor(b, "owner", storyId as never)).not.toBeNull();
    await b.as("writer").mutation(api.storyShare.setShareConsent, { storyId, on: false });
    expect(await kitFor(b, "owner", storyId as never)).toBeNull();
    expect(await kitFor(b, "steward", storyId as never)).toBeNull();
    expect(await kitFor(b, "writer", storyId as never)).toMatchObject({ viewer: "writer" });
  });

  it("is the same for a story written before the tick existed: not shared", async () => {
    const { b, placeId } = await world();
    const writer = await b.run(
      async (ctx) =>
        (await ctx.db.query("person").take(10)).find((p) => p.clerkUserId === "writer")!._id,
    );
    const old = await b.run((ctx) =>
      ctx.db.insert("story", {
        placeId,
        authorPersonId: writer,
        body: "Written before the tick.",
        lang: "en",
        status: "live",
        isMock: false,
      }),
    );
    expect(await kitFor(b, "owner", old as never)).toBeNull();
    expect(await kitFor(b, "steward", old as never)).toBeNull();
    expect(await kitFor(b, "writer", old as never)).toMatchObject({ optedIn: false });
  });

  it("is never given for a story taken down, a demo story or a place that is not public", async () => {
    const { b, placeId } = await world();
    const removed = await tell(b, placeId as never, true);
    await b.as("writer").mutation(api.stories.remove, { storyId: removed });
    const demo = await tell(b, placeId as never, true);
    await b.run((ctx) => ctx.db.patch("story", demo, { isMock: true }));
    const onDraft = await tell(b, placeId as never, true);
    for (const storyId of [removed, demo]) {
      expect(await kitFor(b, "writer", storyId as never)).toBeNull();
      expect(await kitFor(b, "steward", storyId as never)).toBeNull();
    }
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "draft" }));
    expect(await kitFor(b, "writer", onDraft as never)).toBeNull();
    expect(await kitFor(b, "owner", onDraft as never)).toBeNull();
  });

  it("has no kit for a post found in public words: it is not a story, and the kit takes only a story", async () => {
    const { b, placeId } = await world();
    const editor = await b.run(
      async (ctx) =>
        (await ctx.db.query("person").take(10)).find((p) => p.clerkUserId === "editor")!._id,
    );
    const post = await addSource(b, { placeId, addedBy: editor });
    await b.run((ctx) =>
      ctx.db.patch("source", post, {
        origin: "story_finder",
        excerpt: "A found sentence.",
        excerptLang: "en",
      }),
    );
    await expect(kitFor(b, "steward", post as never)).rejects.toBeDefined();
    await expect(kitFor(b, "writer", post as never)).rejects.toBeDefined();
  });

  it("holds what the caption is made from: the words, the place in both languages and the town", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    expect(await kitFor(b, "owner", storyId as never)).toEqual({
      body: "The tram stop here is older than the street.",
      lang: "en",
      authorName: "Test Person (writer)",
      placeEnglish: "Test Shop",
      placeJapanese: "テスト店",
      town: { en: "Nagasaki", ja: "長崎" },
      viewer: "owner",
      optedIn: true,
      canOptIn: true,
    });
  });

  it("names Shimabara for a place whose pin is in Shimabara", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never, true);
    await b.run(async (ctx) => {
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
        .unique();
      await ctx.db.patch("pin", pin!._id, { lat: 32.7897, lng: 130.3731 });
    });
    expect((await kitFor(b, "steward", storyId as never))?.town).toEqual({
      en: "Shimabara",
      ja: "島原",
    });
    const [entry] = await b.as("steward").query(api.storyShare.queue, { regionId: "nagasaki" });
    expect(entry?.town).toEqual({ en: "Shimabara", ja: "島原" });
  });

  it("does not offer the tick where the region does not", async () => {
    const { b, placeId } = await world();
    const storyId = await tell(b, placeId as never);
    sharing().norenAccount = false;
    expect(await kitFor(b, "writer", storyId as never)).toMatchObject({ canOptIn: false });
  });
});
