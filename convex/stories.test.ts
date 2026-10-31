/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { addPerson, addPlace, addSource, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

async function world() {
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const editor = await addPerson(b, "editor", "creator");
  await addPerson(b, "user", "user");
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
