/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CARRY_MAX_METRES } from "../src/lib/slip/carry";
import { openQuestionFor } from "./lib/relay";
import * as region from "./lib/region";

// "Three doors", part 1: a question written at one place and carried to another one nearby.

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;
const METRES_PER_DEGREE = 111_195;
const SHINCHI = { lat: 32.7415, lng: 129.8755 };

function switches(walk: boolean, thread: boolean) {
  vi.restoreAllMocks();
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, connector: true, walk, thread } };
  });
}
beforeEach(() => switches(true, true));
afterEach(() => vi.restoreAllMocks());

type Spec = {
  northMetres?: number;
  visibility?: "draft" | "public" | "demo_public";
  hidden?: boolean;
  noPin?: boolean;
  regionId?: string;
  slug?: string;
  createdBy?: Id<"person">;
};

async function placeAt(b: Backend, creator: Id<"person">, spec: Spec = {}): Promise<Id<"place">> {
  const placeId = await addPlace(b, {
    createdBy: spec.createdBy ?? creator,
    visibility: spec.visibility ?? "public",
    category: "cafe",
    withPin: false,
    ...(spec.regionId === undefined ? {} : { regionId: spec.regionId }),
    ...(spec.slug === undefined ? {} : { slug: spec.slug }),
  });
  await b.run(async (ctx) => {
    if (!spec.noPin)
      await ctx.db.insert("pin", {
        placeId,
        lat: SHINCHI.lat + (spec.northMetres ?? 0) / METRES_PER_DEGREE,
        lng: SHINCHI.lng,
        placedBy: spec.createdBy ?? creator,
        placedAt: Date.now(),
      });
    if (spec.hidden)
      await ctx.db.patch("place", placeId, {
        visibility: "draft",
        hiddenReason: "not_for_visitors",
      });
  });
  return placeId;
}

async function world() {
  const b = newBackend(modules);
  await addPerson(b, "ann", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "bob", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "cy", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "demo", "user", { joinedDaysAgo: 30, isMock: true });
  await addPerson(b, "steward", "steward");
  const editor = await addPerson(b, "editor", "creator");
  const bEditor = await addPerson(b, "b-editor", "creator");
  const a = await placeAt(b, editor, { slug: "place-a" });
  const bPlace = await placeAt(b, editor, {
    slug: "place-b",
    northMetres: 180,
    createdBy: bEditor,
  });
  return { b, editor, bEditor, a, bPlace };
}

const write = (b: Backend, who: string, placeId: Id<"place">, extra: object = {}) =>
  b.as(who).mutation(api.stories.add, { placeId, body: "A story.", lang: "en", ...extra });
const carry = (b: Backend, who: string, from: Id<"place">, to: Id<"place">, text = "Ask?") =>
  write(b, who, from, { nextQuestion: text, nextQuestionFor: to });
const row = (b: Backend, id: Id<"story">) => b.run((ctx) => ctx.db.get("story", id));
const list = (b: Backend, placeId: Id<"place">) => b.t.query(api.stories.listForPlace, { placeId });
const pause = () => new Promise((resolve) => setTimeout(resolve, 3));
const openAt = (b: Backend, placeId: Id<"place">, thread = true) =>
  b.run((ctx) => openQuestionFor(ctx, { id: placeId, category: "cafe" }, { thread }));

describe("carrying a question to another place", () => {
  it("stores where it goes, and the writer's place lists it as carried", async () => {
    const { b, a, bPlace } = await world();
    const id = await carry(b, "ann", a, bPlace, "  Who  paints the sign? ");
    expect(await row(b, id)).toMatchObject({
      nextQuestion: "Who paints the sign?",
      nextQuestionFor: bPlace,
    });
    const [view] = await list(b, a);
    expect(view).toMatchObject({
      nextQuestion: "Who paints the sign?",
      nextQuestionFor: { slug: "place-b" },
    });
    expect(view!.nextQuestionFor!.names.length).toBeGreaterThan(0);
  });

  it("is refused when the question is missing or empty", async () => {
    const { b, a, bPlace } = await world();
    expect(await errorCode(write(b, "ann", a, { nextQuestionFor: bPlace }))).toBe("invalid_input");
    expect(
      await errorCode(write(b, "ann", a, { nextQuestion: "   ", nextQuestionFor: bPlace })),
    ).toBe("invalid_input");
    expect(await list(b, a)).toEqual([]);
  });

  it("is refused for the story's own place", async () => {
    const { b, a } = await world();
    expect(await errorCode(carry(b, "ann", a, a))).toBe("invalid_input");
  });

  it("is refused for a place in another region", async () => {
    const { b, editor, a } = await world();
    const elsewhere = await placeAt(b, editor, { regionId: "elsewhere", northMetres: 100 });
    expect(await errorCode(carry(b, "ann", a, elsewhere))).toBe("invalid_input");
  });

  it.each([
    ["a draft place", { visibility: "draft" as const }],
    ["a place taken off the map", { hidden: true }],
    ["a demo place", { visibility: "demo_public" as const }],
    ["a place with no pin", { noPin: true }],
    ["a place too far away", { northMetres: CARRY_MAX_METRES + 50 }],
  ])("is refused for %s", async (_label, spec: Spec) => {
    const { b, editor, a } = await world();
    const target = await placeAt(b, editor, { northMetres: 100, ...spec });
    expect(await errorCode(carry(b, "ann", a, target))).toBe("invalid_input");
    expect(await list(b, a)).toEqual([]);
  });

  it("is accepted for a place just inside the limit", async () => {
    const { b, editor, a } = await world();
    const target = await placeAt(b, editor, { northMetres: CARRY_MAX_METRES - 20 });
    const id = await carry(b, "ann", a, target);
    expect((await row(b, id))?.nextQuestionFor).toBe(target);
  });

  it.each([
    ["with no pin", "ann", { noPin: true }],
    ["that is still a draft", "editor", { visibility: "draft" as const }],
    ["that is a demo place", "ann", { visibility: "demo_public" as const }],
  ])("is refused from a place %s", async (_label, who, spec: Spec) => {
    const { b, editor, bPlace } = await world();
    const from = await placeAt(b, editor, spec);
    expect(await errorCode(carry(b, who, from, bPlace))).toBe("invalid_input");
  });

  it("is refused for a demo account", async () => {
    const { b, a, bPlace } = await world();
    expect(await errorCode(carry(b, "demo", a, bPlace))).toBe("invalid_input");
  });

  it("is refused while the thread switch is off, and nothing is stored", async () => {
    const { b, a, bPlace } = await world();
    switches(true, false);
    expect(await errorCode(carry(b, "ann", a, bPlace))).toBe("invalid_input");
    expect(await list(b, a)).toEqual([]);
  });

  it("is refused while walk mode is off, even with the thread switch on", async () => {
    const { b, a, bPlace } = await world();
    switches(false, true);
    expect(await errorCode(carry(b, "ann", a, bPlace))).toBe("invalid_input");
  });

  it("leaves a question for the same place exactly as before while the switch is off", async () => {
    const { b, a } = await world();
    switches(true, false);
    const id = await write(b, "ann", a, { nextQuestion: "Why?" });
    expect((await row(b, id))?.nextQuestionFor).toBeUndefined();
    const [view] = await list(b, a);
    expect(view).toMatchObject({ nextQuestion: "Why?" });
    expect(view).not.toHaveProperty("nextQuestionFor");
  });
});

describe("a place's open question", () => {
  it("is a question carried here, with where it came from", async () => {
    const { b, a, bPlace } = await world();
    const id = await carry(b, "ann", a, bPlace, "Who lights the candles?");
    expect(await openAt(b, bPlace)).toMatchObject({
      kind: "story",
      storyId: id,
      text: "Who lights the candles?",
      askedBy: "Test Person (ann)",
      carriedFrom: { slug: "place-a" },
    });
  });

  it("is never the question's own place's, while it is addressed elsewhere", async () => {
    const { b, a, bPlace } = await world();
    await carry(b, "ann", a, bPlace);
    expect(await openAt(b, a)).toMatchObject({ kind: "starter" });
    expect(await openAt(b, a, false)).toMatchObject({ kind: "starter" });
  });

  it("is the newest of the local and the carried questions", async () => {
    const { b, a, bPlace } = await world();
    await write(b, "bob", bPlace, { nextQuestion: "Local, first?" });
    await pause();
    const carried = await carry(b, "ann", a, bPlace, "Carried, second?");
    expect(await openAt(b, bPlace)).toMatchObject({
      storyId: carried,
      carriedFrom: { slug: "place-a" },
    });
    await pause();
    const local = await write(b, "cy", bPlace, { nextQuestion: "Local, third?" });
    const open = await openAt(b, bPlace);
    expect(open).toMatchObject({ storyId: local, text: "Local, third?" });
    expect(open).not.toHaveProperty("carriedFrom");
  });

  it("drops a carried question whose story is removed, and shows the next newest", async () => {
    const { b, a, bPlace } = await world();
    const old = await carry(b, "ann", a, bPlace, "Old?");
    await pause();
    const fresh = await carry(b, "bob", a, bPlace, "New?");
    expect(await openAt(b, bPlace)).toMatchObject({ storyId: fresh });
    await b.as("bob").mutation(api.stories.remove, { storyId: fresh });
    expect(await openAt(b, bPlace)).toMatchObject({ storyId: old });
    await b.as("ann").mutation(api.stories.remove, { storyId: old });
    expect(await openAt(b, bPlace)).toMatchObject({ kind: "starter" });
  });

  it("drops a carried question when its own place is taken off the map or stops being public", async () => {
    const { b, a, bPlace } = await world();
    await carry(b, "ann", a, bPlace);
    await b.run((ctx) =>
      ctx.db.patch("place", a, { visibility: "draft", hiddenReason: "not_for_visitors" }),
    );
    expect(await openAt(b, bPlace)).toMatchObject({ kind: "starter" });
    await b.run((ctx) =>
      ctx.db.patch("place", a, { visibility: "draft", hiddenReason: undefined }),
    );
    expect(await openAt(b, bPlace)).toMatchObject({ kind: "starter" });
  });

  it("goes back to nobody's when the switch is turned off, and comes back when it is turned on", async () => {
    const { b, a, bPlace } = await world();
    const id = await carry(b, "ann", a, bPlace);
    expect(await openAt(b, bPlace, false)).toMatchObject({ kind: "starter" });
    expect(await openAt(b, a, false)).toMatchObject({ kind: "starter" });
    switches(true, false);
    const [view] = await list(b, a);
    expect(view).not.toHaveProperty("nextQuestion");
    expect(view).not.toHaveProperty("nextQuestionFor");
    expect(await b.t.query(api.stories.carriedTo, { placeId: bPlace })).toEqual([]);
    expect(await row(b, id)).toMatchObject({ nextQuestionFor: bPlace });
    switches(true, true);
    expect(await openAt(b, bPlace)).toMatchObject({ storyId: id });
  });
});

describe("answers across places", () => {
  it("name the question's writer and the place it came from", async () => {
    const { b, a, bPlace } = await world();
    const asked = await carry(b, "ann", a, bPlace, "Who lights the candles?");
    const reply = await write(b, "bob", bPlace, { answers: { kind: "story", storyId: asked } });
    expect((await row(b, reply))?.answers).toEqual({ kind: "story", storyId: asked });
    const view = (await list(b, bPlace)).find((s) => s._id === reply);
    expect(view?.answers).toMatchObject({
      kind: "story",
      text: "Who lights the candles?",
      lang: "en",
      askedBy: "Test Person (ann)",
      from: { slug: "place-a" },
    });
  });

  it("are dropped for a carried question at any other place, and for one still for its own", async () => {
    const { b, editor, a, bPlace } = await world();
    const third = await placeAt(b, editor, { northMetres: 300 });
    const asked = await carry(b, "ann", a, bPlace);
    const own = await write(b, "ann", a, { nextQuestion: "Local?" });
    const wrong = await write(b, "bob", third, { answers: { kind: "story", storyId: asked } });
    const atHome = await write(b, "bob", a, { answers: { kind: "story", storyId: asked } });
    const fromBelow = await write(b, "bob", bPlace, { answers: { kind: "story", storyId: own } });
    for (const id of [wrong, atHome, fromBelow])
      expect((await row(b, id))?.answers).toBeUndefined();
  });

  it("are dropped while the switch is off", async () => {
    const { b, a, bPlace } = await world();
    const asked = await carry(b, "ann", a, bPlace);
    switches(true, false);
    const reply = await write(b, "bob", bPlace, { answers: { kind: "story", storyId: asked } });
    expect((await row(b, reply))?.answers).toBeUndefined();
  });

  it("stop showing when the question's own place leaves the map or its question is cleared", async () => {
    const { b, a, bPlace } = await world();
    const asked = await carry(b, "ann", a, bPlace);
    const reply = await write(b, "bob", bPlace, { answers: { kind: "story", storyId: asked } });
    await b.run((ctx) =>
      ctx.db.patch("place", a, { visibility: "draft", hiddenReason: "reported" }),
    );
    expect((await list(b, bPlace)).find((s) => s._id === reply)).not.toHaveProperty("answers");
    await b.run((ctx) =>
      ctx.db.patch("place", a, { visibility: "public", hiddenReason: undefined }),
    );
    expect((await list(b, bPlace)).find((s) => s._id === reply)?.answers).toBeDefined();
    await b.as("ann").mutation(api.stories.clearQuestion, { storyId: asked });
    expect((await list(b, bPlace)).find((s) => s._id === reply)).not.toHaveProperty("answers");
  });
});

describe("the places a question can be carried to", () => {
  const targets = (b: Backend, placeId: Id<"place">) =>
    b.t.query(api.stories.carryTargets, { placeId });

  it("are the nearest real public places within the limit, nearest first, with no viewer", async () => {
    const { b, editor, a, bPlace } = await world();
    await placeAt(b, editor, { slug: "p-90", northMetres: -90 });
    await placeAt(b, editor, { slug: "p-far", northMetres: 2000 });
    await placeAt(b, editor, { slug: "p-draft", northMetres: 50, visibility: "draft" });
    await placeAt(b, editor, { slug: "p-hidden", northMetres: 60, hidden: true });
    await placeAt(b, editor, { slug: "p-demo", northMetres: 70, visibility: "demo_public" });
    await placeAt(b, editor, { slug: "p-nopin", noPin: true });
    const found = await targets(b, a);
    expect(found.map(({ slug }) => slug)).toEqual(["p-90", "place-b"]);
    expect(found[1]).toMatchObject({ placeId: bPlace, slug: "place-b" });
    expect(found.map(({ metres }) => metres)).toEqual([90, 180]);
    expect(found[0]!.names.length).toBeGreaterThan(0);
    expect(Object.keys(found[0]!).toSorted()).toEqual(["metres", "names", "placeId", "slug"]);
  });

  it("are at most fifty", async () => {
    const { b, editor, a } = await world();
    for (let i = 0; i < 55; i++) await placeAt(b, editor, { northMetres: 20 + i * 10 });
    const found = await targets(b, a);
    expect(found).toHaveLength(50);
    expect(found.map(({ metres }) => metres)).toEqual(
      found.map(({ metres }) => metres).toSorted((x, y) => x - y),
    );
  });

  it("are none when the switch is off, or the place has no pin, is not public or does not exist", async () => {
    const { b, editor, a } = await world();
    const noPin = await placeAt(b, editor, { noPin: true });
    const draft = await placeAt(b, editor, { visibility: "draft", northMetres: 10 });
    expect(await targets(b, noPin)).toEqual([]);
    expect(await targets(b, draft)).toEqual([]);
    switches(true, false);
    expect(await targets(b, a)).toEqual([]);
    switches(false, true);
    expect(await targets(b, a)).toEqual([]);
  });

  it("take a place and nothing else", async () => {
    const { b, a } = await world();
    const withPosition = { placeId: a, lat: 32.7, lng: 129.8 };
    expect(await errorCode(b.t.query(api.stories.carryTargets, withPosition as never))).not.toBe(
      "did not fail",
    );
  });
});

describe("questions carried to a place", () => {
  const carried = (b: Backend, placeId: Id<"place">) =>
    b.t.query(api.stories.carriedTo, { placeId });

  it("are listed newest first with the writer, the words as written and where they came from", async () => {
    const { b, a, bPlace } = await world();
    const first = await carry(b, "ann", a, bPlace, "First?");
    await pause();
    const second = await write(b, "bob", a, {
      nextQuestion: "二つ目？",
      nextQuestionFor: bPlace,
      lang: "ja",
    });
    const rows = await carried(b, bPlace);
    expect(rows.map(({ storyId }) => storyId)).toEqual([second, first]);
    expect(rows[0]).toMatchObject({
      text: "二つ目？",
      lang: "ja",
      askedBy: "Test Person (bob)",
      from: { slug: "place-a" },
    });
    expect(typeof rows[0]!.addedAt).toBe("number");
    expect(await carried(b, a)).toEqual([]);
  });

  it("are at most five", async () => {
    const { b, a, bPlace } = await world();
    const ann = (await b.run((ctx) => ctx.db.query("person").take(20))).find(
      (p) => p.clerkUserId === "ann",
    )!;
    for (let i = 0; i < 7; i++) {
      await pause();
      await b.run((ctx) =>
        ctx.db.insert("story", {
          placeId: a,
          authorPersonId: ann._id,
          body: "x",
          lang: "en",
          status: "live",
          isMock: false,
          nextQuestion: `Q${i}?`,
          nextQuestionFor: bPlace,
        }),
      );
    }
    const rows = await carried(b, bPlace);
    expect(rows.map(({ text }) => text)).toEqual(["Q6?", "Q5?", "Q4?", "Q3?", "Q2?"]);
  });

  it("leave out a removed story, one from a place off the map, and everything while the switch is off", async () => {
    const { b, a, bPlace } = await world();
    const gone = await carry(b, "ann", a, bPlace, "Gone?");
    await b.as("ann").mutation(api.stories.remove, { storyId: gone });
    expect(await carried(b, bPlace)).toEqual([]);
    await carry(b, "bob", a, bPlace, "Shown?");
    expect(await carried(b, bPlace)).toHaveLength(1);
    await b.run((ctx) =>
      ctx.db.patch("place", a, { visibility: "draft", hiddenReason: "reported" }),
    );
    expect(await carried(b, bPlace)).toEqual([]);
    await b.run((ctx) =>
      ctx.db.patch("place", a, { visibility: "public", hiddenReason: undefined }),
    );
    expect(await carried(b, bPlace)).toHaveLength(1);
    switches(true, false);
    expect(await carried(b, bPlace)).toEqual([]);
  });
});

describe("clearing a carried question", () => {
  it("is allowed to the writer, either place's editor and a steward, and clears both fields", async () => {
    const { b, a, bPlace } = await world();
    for (const who of ["ann", "b-editor", "editor", "steward"]) {
      const id = await carry(b, "ann", a, bPlace);
      await b.as(who).mutation(api.stories.clearQuestion, { storyId: id });
      const after = await row(b, id);
      expect(after?.nextQuestion).toBeUndefined();
      expect(after?.nextQuestionFor).toBeUndefined();
      expect(after?.status).toBe("live");
    }
  });

  it("is offered on the carried-here list to exactly the people who may do it", async () => {
    const { b, a, bPlace } = await world();
    await carry(b, "ann", a, bPlace);
    const offered = async (who?: string) => {
      const [row] = await (who === undefined ? b.t : b.as(who)).query(api.stories.carriedTo, {
        placeId: bPlace,
      });
      return row!.canRemove;
    };
    expect(await offered()).toBe(false);
    expect(await offered("cy")).toBe(false);
    for (const who of ["ann", "b-editor", "editor", "steward"])
      expect(await offered(who)).toBe(true);
  });

  it("is refused to a stranger", async () => {
    const { b, a, bPlace } = await world();
    const id = await carry(b, "ann", a, bPlace);
    expect(await errorCode(b.as("cy").mutation(api.stories.clearQuestion, { storyId: id }))).toBe(
      "forbidden",
    );
    expect(await row(b, id)).toMatchObject({ nextQuestionFor: bPlace });
  });

  it("is not something the target's editor can do to a question that is not carried to it", async () => {
    const { b, a } = await world();
    const id = await write(b, "ann", a, { nextQuestion: "Here?" });
    expect(
      await errorCode(b.as("b-editor").mutation(api.stories.clearQuestion, { storyId: id })),
    ).toBe("forbidden");
  });

  it("writes the audit row, with no words in it", async () => {
    const { b, a, bPlace } = await world();
    const id = await carry(b, "ann", a, bPlace, "Secret words?");
    await b.as("b-editor").mutation(api.stories.clearQuestion, { storyId: id });
    const audits = await b.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(20)).filter(
        (x) => x.action === "story.question_cleared",
      ),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      targetId: id,
      diff: { nextQuestion: false, nextQuestionFor: false },
    });
    expect(JSON.stringify(audits[0])).not.toContain("Secret");
  });

  it("still works while the switch is off", async () => {
    const { b, a, bPlace } = await world();
    const id = await carry(b, "ann", a, bPlace);
    switches(true, false);
    await b.as("b-editor").mutation(api.stories.clearQuestion, { storyId: id });
    expect((await row(b, id))?.nextQuestionFor).toBeUndefined();
  });
});
