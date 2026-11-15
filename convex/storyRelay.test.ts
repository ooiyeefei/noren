/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { runOmikujiToday } from "./connector";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;
const NOON = Date.UTC(2026, 10, 10, 3, 0, 0);

function switchOn(walk: boolean) {
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, connector: true, walk } };
  });
}
beforeEach(() => switchOn(true));
afterEach(() => vi.restoreAllMocks());

async function world() {
  const b = newBackend(modules);
  const ann = await addPerson(b, "ann", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "bob", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "cy", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "steward", "steward");
  const editor = await addPerson(b, "editor", "creator");
  const placeId = await addPlace(b, { createdBy: editor, visibility: "public", category: "cafe" });
  const otherPlace = await addPlace(b, { createdBy: editor, visibility: "public" });
  return { b, ann, placeId, otherPlace };
}

const write = (b: Backend, who: string, placeId: Id<"place">, extra: object = {}) =>
  b.as(who).mutation(api.stories.add, { placeId, body: "A story.", lang: "en", ...extra });
const list = (b: Backend, placeId: Id<"place">) => b.t.query(api.stories.listForPlace, { placeId });
const row = (b: Backend, id: Id<"story">) => b.run((ctx) => ctx.db.get("story", id));
const pause = () => new Promise((resolve) => setTimeout(resolve, 3));

describe("a question for the next visitor", () => {
  it("is cleaned, stored and listed with the writer's own words", async () => {
    const { b, placeId } = await world();
    const id = await write(b, "ann", placeId, { nextQuestion: "  Who paints\n the   sign?  " });
    expect((await row(b, id))?.nextQuestion).toBe("Who paints the sign?");
    const [view] = await list(b, placeId);
    expect(view).toMatchObject({ nextQuestion: "Who paints the sign?", firstTeller: true });
  });

  it("is optional, and an empty one is dropped", async () => {
    const { b, placeId } = await world();
    const id = await write(b, "ann", placeId, { nextQuestion: "   " });
    expect((await row(b, id))?.nextQuestion).toBeUndefined();
  });

  it.each([
    ["too long", "x".repeat(141)],
    ["a link", "See https://example.com now?"],
    ["a bare domain", "Is it on example.com?"],
    ["an email", "Mail me a@b.example?"],
    ["a handle", "Ask @someone about it?"],
    ["a phone number", "Call 095-822-1234 and ask?"],
  ])("is refused with %s", async (_label, nextQuestion) => {
    const { b, placeId } = await world();
    expect(await errorCode(write(b, "ann", placeId, { nextQuestion }))).toBe("invalid_input");
    expect(await list(b, placeId)).toEqual([]);
  });

  it("is refused while walk mode is off, and answers are ignored", async () => {
    vi.restoreAllMocks();
    switchOn(false);
    const { b, placeId } = await world();
    expect(await errorCode(write(b, "ann", placeId, { nextQuestion: "Why?" }))).toBe(
      "invalid_input",
    );
    const id = await write(b, "ann", placeId, { answers: { kind: "starter", key: "oldest" } });
    expect((await row(b, id))?.answers).toBeUndefined();
    const [view] = await list(b, placeId);
    expect(view).toMatchObject({ firstTeller: false });
    expect(view).not.toHaveProperty("nextQuestion");
    expect(view).not.toHaveProperty("answers");
  });

  it("goes unlisted as a question, but the story stays, when walk mode goes off later", async () => {
    const { b, placeId } = await world();
    await write(b, "ann", placeId, { nextQuestion: "Why?" });
    vi.restoreAllMocks();
    switchOn(false);
    const [view] = await list(b, placeId);
    expect(view).not.toHaveProperty("nextQuestion");
    expect(view!.firstTeller).toBe(false);
  });
});

describe("answers", () => {
  it("resolve to the question's words and the asker's name", async () => {
    const { b, placeId } = await world();
    const asked = await write(b, "ann", placeId, { nextQuestion: "Who built the wall?" });
    await pause();
    const reply = await write(b, "bob", placeId, { answers: { kind: "story", storyId: asked } });
    expect((await row(b, reply))?.answers).toEqual({ kind: "story", storyId: asked });
    const views = await list(b, placeId);
    expect(views.find((s) => s._id === reply)?.answers).toEqual({
      kind: "story",
      text: "Who built the wall?",
      lang: "en",
      askedBy: "Test Person (ann)",
    });
    expect(views.find((s) => s._id === asked)?.firstTeller).toBe(true);
    expect(views.find((s) => s._id === reply)?.firstTeller).toBe(false);
  });

  it("are dropped silently for a question at another place, one with none, or a bad id", async () => {
    const { b, placeId, otherPlace } = await world();
    const elsewhere = await write(b, "ann", otherPlace, { nextQuestion: "Why here?" });
    const plain = await write(b, "ann", placeId);
    for (const storyId of [elsewhere as string, plain as string, "not-an-id", "k57abc"]) {
      const id = await write(b, "bob", placeId, { answers: { kind: "story", storyId } });
      expect((await row(b, id))?.answers).toBeUndefined();
    }
  });

  it("take a starter from the list only", async () => {
    const { b, placeId } = await world();
    const ok = await write(b, "ann", placeId, { answers: { kind: "starter", key: "oldest" } });
    const bad = await write(b, "bob", placeId, { answers: { kind: "starter", key: "nope" } });
    expect((await row(b, ok))?.answers).toEqual({ kind: "starter", key: "oldest" });
    expect((await row(b, bad))?.answers).toBeUndefined();
    const views = await list(b, placeId);
    expect(views.find((s) => s._id === ok)?.answers).toEqual({ kind: "starter", key: "oldest" });
  });

  it("stop showing once the question is cleared or its story removed", async () => {
    const { b, placeId } = await world();
    const asked = await write(b, "ann", placeId, { nextQuestion: "Why?" });
    const reply = await write(b, "bob", placeId, { answers: { kind: "story", storyId: asked } });
    await b.as("ann").mutation(api.stories.clearQuestion, { storyId: asked });
    expect((await list(b, placeId)).find((s) => s._id === reply)).not.toHaveProperty("answers");
  });
});

describe("clearQuestion", () => {
  it("lets the writer, the place's editor and a steward, and nobody else", async () => {
    const { b, placeId } = await world();
    const ask = () => write(b, "ann", placeId, { nextQuestion: "Why?" });
    const first = await ask();
    expect(
      await errorCode(b.as("cy").mutation(api.stories.clearQuestion, { storyId: first })),
    ).toBe("forbidden");
    for (const who of ["ann", "editor", "steward"]) {
      const id = await ask();
      await b.as(who).mutation(api.stories.clearQuestion, { storyId: id });
      const after = await row(b, id);
      expect(after?.nextQuestion).toBeUndefined();
      expect(after?.status).toBe("live");
    }
  });

  it("writes an audit row, once, and does nothing the second time", async () => {
    const { b, placeId } = await world();
    const id = await write(b, "ann", placeId, { nextQuestion: "Why?" });
    await b.as("ann").mutation(api.stories.clearQuestion, { storyId: id });
    await b.as("ann").mutation(api.stories.clearQuestion, { storyId: id });
    const audits = await b.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(20)).filter(
        (a) => a.action === "story.question_cleared",
      ),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ targetId: id, diff: { nextQuestion: false } });
    expect(JSON.stringify(audits[0])).not.toContain("Why?");
  });

  it("still works while walk mode is off", async () => {
    const { b, placeId } = await world();
    const id = await write(b, "ann", placeId, { nextQuestion: "Why?" });
    vi.restoreAllMocks();
    switchOn(false);
    await b.as("ann").mutation(api.stories.clearQuestion, { storyId: id });
    expect((await row(b, id))?.nextQuestion).toBeUndefined();
  });
});

describe("the first teller", () => {
  it("is the earliest shown story, even when the page's window does not reach it", async () => {
    const { b, ann, placeId } = await world();
    const people = await b.run(async (ctx) =>
      (await ctx.db.query("person").take(20)).filter((p) =>
        ["bob", "cy", "editor"].includes(p.clerkUserId ?? ""),
      ),
    );
    const insert = (authorPersonId: Id<"person">) =>
      b.run((ctx) =>
        ctx.db.insert("story", {
          placeId,
          authorPersonId,
          body: "x",
          lang: "en",
          status: "live",
          isMock: false,
        }),
      );
    const earliest = await insert(ann);
    for (let i = 0; i < 20; i++) for (const p of people) await insert(p._id);
    const views = await list(b, placeId);
    expect(views).toHaveLength(50);
    expect(views.some((s) => s._id === earliest)).toBe(false);
    expect(views.some((s) => s.firstTeller)).toBe(false);
  });

  it("moves on when the first story is removed", async () => {
    const { b, placeId } = await world();
    const one = await write(b, "ann", placeId);
    await pause();
    const two = await write(b, "bob", placeId);
    await b.as("ann").mutation(api.stories.remove, { storyId: one });
    const views = await list(b, placeId);
    expect(views.map((s) => [s._id, s.firstTeller])).toEqual([[two, true]]);
  });
});

describe("the question sealed in a slip", () => {
  const today = (b: Backend) =>
    b.run((ctx) => runOmikujiToday(ctx, { regionId: "nagasaki" }, NOON));
  const pinned = async (b: Backend, placeId: Id<"place">) => {
    await b.run(async (ctx) => {
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
        .unique();
      await ctx.db.patch("pin", pin!._id, { lat: 32.7415, lng: 129.8755 });
    });
  };

  it("is a starter for a place with no question, on every slip", async () => {
    const { b, placeId } = await world();
    await pinned(b, placeId);
    const { slips } = await today(b);
    expect(slips.length).toBeGreaterThan(1);
    for (const slip of slips) {
      expect(slip.question).toMatchObject({ kind: "starter" });
    }
  });

  it("is the newest shown question when there is one, with who asked", async () => {
    const { b, placeId, otherPlace } = await world();
    await pinned(b, placeId);
    await b.run(async (ctx) => {
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", otherPlace))
        .unique();
      await ctx.db.patch("pin", pin!._id, { lat: 32.7415, lng: 129.8755 });
      await ctx.db.patch("place", otherPlace, {
        hiddenReason: "not_for_visitors",
        visibility: "draft",
      });
    });
    const old = await write(b, "ann", placeId, { nextQuestion: "Old one?" });
    await pause();
    const fresh = await write(b, "bob", placeId, { nextQuestion: "New one?" });
    const slips = (await today(b)).slips;
    const questions = slips.map((s) => s.question);
    expect(questions.every((q) => q?.kind === "story")).toBe(true);
    expect(questions[0]).toEqual({
      kind: "story",
      storyId: fresh,
      text: "New one?",
      lang: "en",
      askedBy: "Test Person (bob)",
    });
    await b.as("bob").mutation(api.stories.remove, { storyId: fresh });
    expect((await today(b)).slips[0]!.question).toMatchObject({ storyId: old, text: "Old one?" });
  });

  it("is left out while walk mode is off", async () => {
    vi.restoreAllMocks();
    switchOn(false);
    const { b, placeId } = await world();
    await pinned(b, placeId);
    const { slips } = await today(b);
    expect(slips.length).toBeGreaterThan(0);
    for (const slip of slips) expect(slip).not.toHaveProperty("question");
  });
});
