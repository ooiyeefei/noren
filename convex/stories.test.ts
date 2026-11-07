/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { addPerson, addPlace, addSource, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function world() {
  const b = newBackend(modules);
  await addPerson(b, "user", "user", { joinedDaysAgo: 30 });
  const steward = await addPerson(b, "steward", "steward");
  const editor = await addPerson(b, "editor", "creator");
  await addPerson(b, "other", "user");
  await addPerson(b, "mock", "user", { isMock: true });
  const placeId = await addPlace(b, { createdBy: editor, visibility: "public" });
  return { b, steward, editor, placeId };
}

describe("stories written in Noren", () => {
  it("any member writes one; everyone reads it with the writer's name, newest first", async () => {
    const { b, placeId } = await world();
    await b.as("user").mutation(api.stories.add, {
      placeId,
      body: "  猫が階段で昼寝していました。 ",
      lang: "ja",
    });
    await b.as("other").mutation(api.stories.add, {
      placeId,
      body: "The owner told us about the old tram stop.",
      lang: "en",
    });
    const stories = await b.t.query(api.stories.listForPlace, { placeId });
    expect(
      stories.map(({ body, lang, authorName, addedByMe, canRemove }) => ({
        body,
        lang,
        authorName,
        addedByMe,
        canRemove,
      })),
    ).toEqual([
      {
        body: "The owner told us about the old tram stop.",
        lang: "en",
        authorName: "Test Person (other)",
        addedByMe: false,
        canRemove: false,
      },
      {
        body: "猫が階段で昼寝していました。",
        lang: "ja",
        authorName: "Test Person (user)",
        addedByMe: false,
        canRemove: false,
      },
    ]);
    const mine = await b.as("user").query(api.stories.listForPlace, { placeId });
    expect(mine.map((story) => [story.addedByMe, story.canRemove])).toEqual([
      [false, false],
      [true, true],
    ]);
    // The place's editor and a steward may take down anyone's story.
    for (const name of ["editor", "steward"]) {
      const view = await b.as(name).query(api.stories.listForPlace, { placeId });
      expect(view.map((story) => [story.addedByMe, story.canRemove])).toEqual([
        [false, true],
        [false, true],
      ]);
    }
  });

  it("a place someone cannot read has no stories for them", async () => {
    const { b, editor } = await world();
    const draft = await addPlace(b, { createdBy: editor });
    await b.run((ctx) =>
      ctx.db.insert("story", {
        placeId: draft,
        authorPersonId: editor,
        body: "架空の話。",
        lang: "ja",
        status: "live",
        isMock: false,
      }),
    );
    expect(await b.t.query(api.stories.listForPlace, { placeId: draft })).toEqual([]);
    expect(await b.as("user").query(api.stories.listForPlace, { placeId: draft })).toEqual([]);
    expect(await b.as("editor").query(api.stories.listForPlace, { placeId: draft })).toHaveLength(
      1,
    );
  });

  it("refuses a signed-out writer, an empty or overlong story, a language the region lacks and a place they cannot read", async () => {
    const { b, placeId, editor } = await world();
    const add = (as: "user" | null, body: string, lang = "en", place = placeId) =>
      (as ? b.as(as) : b.t).mutation(api.stories.add, { placeId: place, body, lang });
    expect(await errorCode(add(null, "A story"))).toBe("unauthenticated");
    expect(await errorCode(add("user", "   "))).toBe("invalid_input");
    expect(await errorCode(add("user", "a".repeat(1001)))).toBe("invalid_input");
    await add("user", "a".repeat(1000));
    expect(await errorCode(add("user", "A story", "fr"))).toBe("invalid_input");
    const draft = await addPlace(b, { createdBy: editor });
    expect(await errorCode(add("user", "A story", "en", draft))).toBe("not_found");
  });

  it("the writer, the place's editor or a steward can take it down; nobody else can", async () => {
    const { b, placeId } = await world();
    const write = () =>
      b.as("user").mutation(api.stories.add, { placeId, body: "A story", lang: "en" });
    const first = await write();
    expect(await errorCode(b.as("other").mutation(api.stories.remove, { storyId: first }))).toBe(
      "forbidden",
    );
    await b.as("user").mutation(api.stories.remove, { storyId: first });
    const second = await write();
    await b.as("editor").mutation(api.stories.remove, { storyId: second });
    const third = await write();
    await b.as("steward").mutation(api.stories.remove, { storyId: third });
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);
    const audits = await b.run((ctx) => ctx.db.query("auditLog").take(10));
    expect(audits.map((entry) => entry.action)).toEqual(["story.remove"]);
  });

  it("a demo account's story shows on a real place only to its writer", async () => {
    const { b, placeId } = await world();
    await b.as("mock").mutation(api.stories.add, { placeId, body: "Demo story", lang: "en" });
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);
    expect(await b.as("mock").query(api.stories.listForPlace, { placeId })).toHaveLength(1);
  });

  it("a member writes at most 50 stories a day; a steward is not capped", async () => {
    const { b, placeId } = await world();
    const write = (as: "user" | "steward") =>
      b.as(as).mutation(api.stories.add, { placeId, body: "A story", lang: "en" });
    for (let i = 0; i < 50; i++) await write("user");
    expect(await errorCode(write("user"))).toBe("rate_limited");
    for (let i = 0; i < 51; i++) await write("steward");
  });
});

describe("one card per person on a place page", () => {
  const write = (b: Awaited<ReturnType<typeof world>>["b"], as: string, placeId: Id<"place">) =>
    b.as(as).mutation(api.stories.add, { placeId, body: `A moment from ${as}`, lang: "en" });

  it("gives all of a person's stories here one key: the id of their earliest, never their own", async () => {
    const { b, steward, editor, placeId } = await world();
    const first = await write(b, "user", placeId);
    const theirs = await write(b, "other", placeId);
    await write(b, "user", placeId);
    await write(b, "user", placeId);
    const stories = await b.t.query(api.stories.listForPlace, { placeId });
    expect(stories.map((story) => story.authorKey)).toEqual([first, first, theirs, first]);
    const people = await b.run((ctx) => ctx.db.query("person").take(20));
    const personIds = new Set<string>([...people.map((person) => person._id), steward, editor]);
    for (const story of stories) expect(personIds.has(story.authorKey)).toBe(false);
    expect(JSON.stringify(stories)).not.toMatch(/authorPersonId/);
    for (const person of people) expect(JSON.stringify(stories)).not.toContain(person._id);
  });

  it("tells two people with one name apart", async () => {
    const { b, placeId } = await world();
    for (const name of ["user", "other"])
      await b.as(name).mutation(api.people.setMyDisplayName, { displayName: "Lantern fan" });
    await write(b, "user", placeId);
    await write(b, "other", placeId);
    const stories = await b.t.query(api.stories.listForPlace, { placeId });
    expect(stories.map((story) => story.authorName)).toEqual(["Lantern fan", "Lantern fan"]);
    expect(new Set(stories.map((story) => story.authorKey)).size).toBe(2);
  });

  it("cannot follow a person from one place to another", async () => {
    const { b, editor, placeId } = await world();
    const elsewhere = await addPlace(b, { createdBy: editor, visibility: "public" });
    const here = await write(b, "user", placeId);
    const there = await write(b, "user", elsewhere);
    const [mine] = await b.t.query(api.stories.listForPlace, { placeId });
    const [mineThere] = await b.t.query(api.stories.listForPlace, { placeId: elsewhere });
    expect(mine?.authorKey).toBe(here);
    expect(mineThere?.authorKey).toBe(there);
  });

  it("moves the key to the next story when the earliest is removed", async () => {
    const { b, placeId } = await world();
    const first = await write(b, "user", placeId);
    const second = await write(b, "user", placeId);
    await b.as("user").mutation(api.stories.remove, { storyId: first });
    const stories = await b.t.query(api.stories.listForPlace, { placeId });
    expect(stories.map((story) => [story._id, story.authorKey])).toEqual([[second, second]]);
  });

  it("builds the key only from stories the viewer may see", async () => {
    const { b, placeId } = await world();
    const demo = await write(b, "mock", placeId);
    const real = await write(b, "user", placeId);
    // A demo account's story shows on a real place only to its writer, so nobody else learns its id.
    const anyone = await b.t.query(api.stories.listForPlace, { placeId });
    expect(anyone.map((story) => story.authorKey)).toEqual([real]);
    expect(JSON.stringify(anyone)).not.toContain(demo);
    const writer = await b.as("mock").query(api.stories.listForPlace, { placeId });
    expect(writer.map((story) => story.authorKey)).toEqual([real, demo]);
  });

  describe("a regular with many stories", () => {
    const insert = (b: Awaited<ReturnType<typeof world>>["b"], placeId: Id<"place">, as: string) =>
      b.run(async (ctx) => {
        const person = await ctx.db
          .query("person")
          .filter((q) => q.eq(q.field("displayName"), `Test Person (${as})`))
          .first();
        return ctx.db.insert("story", {
          placeId,
          authorPersonId: person!._id,
          body: `A moment from ${as}`,
          lang: "en",
          status: "live",
          isMock: false,
        });
      });

    it("leaves room for everyone else, keeping the regular's newest stories", async () => {
      const { b, placeId } = await world();
      const older = await insert(b, placeId, "other");
      const regular: Id<"story">[] = [];
      for (let i = 0; i < 60; i++) regular.push(await insert(b, placeId, "user"));
      const stories = await b.t.query(api.stories.listForPlace, { placeId });
      expect(stories.map((story) => story._id)).toEqual([
        ...regular.slice(-20).reverse(),
        older,
      ]);
      // Among those returned, so the key is the earliest story the page was given.
      expect(new Set(stories.slice(0, 20).map((story) => story.authorKey))).toEqual(
        new Set([regular.at(-20)]),
      );
    });

    it("shows at most 50 stories on a page", async () => {
      const { b, placeId } = await world();
      for (let i = 0; i < 3; i++) await addPerson(b, `walker${i}`, "user");
      for (const name of ["user", "other", "walker0", "walker1", "walker2"])
        for (let i = 0; i < 12; i++) await insert(b, placeId, name);
      expect(await b.t.query(api.stories.listForPlace, { placeId })).toHaveLength(50);
    });
  });
});

describe("the name goes first (FR-131)", () => {
  const story = { body: "A story", lang: "en" };

  it.each(["user", "creator", "business_owner"] as const)(
    "refuses an unconfirmed %s and stores nothing, then lets them share once confirmed",
    async (role) => {
      const { b, placeId } = await world();
      await addPerson(b, "unconfirmed", role, { nameConfirmed: false });
      expect(
        await errorCode(b.as("unconfirmed").mutation(api.stories.add, { placeId, ...story })),
      ).toBe("name_not_confirmed");
      expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);
      await b.as("unconfirmed").mutation(api.people.confirmMyDisplayName, {});
      await b.as("unconfirmed").mutation(api.stories.add, { placeId, ...story });
      expect(await b.t.query(api.stories.listForPlace, { placeId })).toHaveLength(1);
    },
  );

  it("a chosen name is what the story shows", async () => {
    const { b, placeId } = await world();
    await addPerson(b, "unconfirmed", "user", { nameConfirmed: false });
    await b.as("unconfirmed").mutation(api.people.setMyDisplayName, { displayName: "Lantern fan" });
    await b.as("unconfirmed").mutation(api.stories.add, { placeId, ...story });
    expect((await b.t.query(api.stories.listForPlace, { placeId }))[0]?.authorName).toBe(
      "Lantern fan",
    );
  });

  it("never refuses a steward, whatever the deploy order, or a demo account", async () => {
    const { b, placeId } = await world();
    await addPerson(b, "unconfirmed-steward", "steward", { nameConfirmed: false });
    await addPerson(b, "unconfirmed-demo", "user", { nameConfirmed: false, isMock: true });
    await b.as("unconfirmed-steward").mutation(api.stories.add, { placeId, ...story });
    await b.as("unconfirmed-demo").mutation(api.stories.add, { placeId, ...story });
  });

  it("a new member's story goes live at once, up to 5 a day", async () => {
    const { b, placeId } = await world();
    await addPerson(b, "newcomer", "user");
    const write = () => b.as("newcomer").mutation(api.stories.add, { placeId, ...story });
    for (let i = 0; i < 5; i++) await write();
    expect(await errorCode(write())).toBe("rate_limited");
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toHaveLength(5);
  });
});

describe("the newest stories on the home page", () => {
  it("shows written stories and shared posts from real places, newest first, with names and the member's own line", async () => {
    const { b, steward, editor, placeId } = await world();
    const hiddenPlace = await addPlace(b, { createdBy: editor, visibility: "public" });
    const draft = await addPlace(b, { createdBy: editor });
    const demo = await addPlace(b, { createdBy: steward, visibility: "demo_public", isMock: true });
    await b.as("user").mutation(api.stories.add, { placeId, body: "最初の話。", lang: "ja" });
    await b.as("other").mutation(api.sources.add, {
      placeId,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      note: "The tram stop story, on video.",
      noteLang: "en",
    });
    await b.as("user").mutation(api.stories.add, { placeId, body: "Newest story.", lang: "en" });
    // None of these may reach the home page.
    await b.as("mock").mutation(api.stories.add, { placeId, body: "架空の話。", lang: "ja" });
    await b
      .as("editor")
      .mutation(api.stories.add, { placeId: draft, body: "下書き。", lang: "ja" });
    await b.as("user").mutation(api.stories.add, { placeId: demo, body: "デモ。", lang: "ja" });
    await b.as("mock").mutation(api.stories.add, { placeId: demo, body: "デモの話。", lang: "ja" });
    await b.as("mock").mutation(api.sources.add, {
      placeId,
      url: "https://www.youtube.com/watch?v=bcdefghijkl",
      note: "架空の投稿。",
      noteLang: "ja",
    });
    await b.as("user").mutation(api.stories.add, {
      placeId: hiddenPlace,
      body: "隠れた場所。",
      lang: "ja",
    });
    await b.run((ctx) =>
      ctx.db.patch("place", hiddenPlace, { hiddenReason: "not_for_visitors", visibility: "draft" }),
    );
    await addSource(b, { placeId, addedBy: steward });
    const latest = await b.t.query(api.stories.latest, { regionId: "nagasaki" });
    expect(
      latest.map(({ kind, text, lang, platform, sharedBy }) => ({
        kind,
        text,
        lang,
        platform,
        sharedBy,
      })),
    ).toEqual([
      {
        kind: "written",
        text: "Newest story.",
        lang: "en",
        platform: undefined,
        sharedBy: "Test Person (user)",
      },
      {
        kind: "post",
        text: "The tram stop story, on video.",
        lang: "en",
        platform: "youtube",
        sharedBy: "Test Person (other)",
      },
      {
        kind: "written",
        text: "最初の話。",
        lang: "ja",
        platform: undefined,
        sharedBy: "Test Person (user)",
      },
    ]);
    const place = await b.t.run((ctx) => ctx.db.get("place", placeId));
    expect(latest.every((entry) => entry.placeSlug === place?.slug)).toBe(true);
    expect(latest[0]?.placeNames.length).toBeGreaterThan(0);
    expect(await b.t.query(api.stories.latest, { regionId: "elsewhere" })).toEqual([]);
    // The place's editor can read both places, but the home page keeps to what everyone may read.
    const editorView = (
      await b.as("editor").query(api.stories.latest, { regionId: "nagasaki" })
    ).map((entry) => entry.text);
    expect(editorView).not.toContain("下書き。");
    expect(editorView).not.toContain("隠れた場所。");
  });

  it("shows at most eight", async () => {
    const { b, placeId } = await world();
    for (let n = 0; n < 10; n++)
      await b.as("user").mutation(api.stories.add, { placeId, body: `話 ${n}`, lang: "ja" });
    const latest = await b.t.query(api.stories.latest, { regionId: "nagasaki" });
    expect(latest.map((entry) => entry.text)).toEqual(
      Array.from({ length: 8 }, (_, n) => `話 ${9 - n}`),
    );
  });
});
