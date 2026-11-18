/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;

/** As the region's file does once the owner turns the postcard on. */
function postcardOn(on: boolean) {
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => {
    const config = realRegionConfig(id);
    return { ...config, features: { ...config.features, postcard: on } };
  });
}

beforeEach(() => postcardOn(true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const CODE = /^[23456789abcdefghjkmnpqrstuvwxyz]{24}$/;

async function world() {
  const b = newBackend(modules);
  const hana = await addPerson(b, "hana", "user", { joinedDaysAgo: 30 });
  await addPerson(b, "kenta", "user", { joinedDaysAgo: 30 });
  const steward = await addPerson(b, "steward", "steward");
  const first = await addPlace(b, { createdBy: steward, visibility: "public", slug: "first" });
  const second = await addPlace(b, { createdBy: steward, visibility: "public", slug: "second" });
  const third = await addPlace(b, { createdBy: steward, visibility: "public", slug: "third" });
  return { b, steward, hana, first, second, third };
}
type World = Awaited<ReturnType<typeof world>>;

async function story(
  b: Backend,
  authorPersonId: Id<"person">,
  placeId: Id<"place">,
  extra: { body?: string; allowed?: boolean; status?: "live" | "hidden" } = {},
) {
  return await b.run((ctx) =>
    ctx.db.insert("story", {
      placeId,
      authorPersonId,
      body: extra.body ?? "The owner told me the shop is older than the tram.",
      lang: "en",
      status: extra.status ?? "live",
      isMock: false,
      ...(extra.allowed ? { connectorAllowedAt: 1 } : {}),
    }),
  );
}

async function photo(
  b: Backend,
  person: Id<"person">,
  placeId: Id<"place">,
  storyId: Id<"story">,
  status: "live" | "waiting" = "live",
) {
  return await b.run((ctx) =>
    ctx.db.insert("storyPhoto", {
      placeId,
      uploaderPersonId: person,
      storyId,
      position: 0,
      status,
      incomingKey: `incoming/${storyId}.jpg`,
      key: `photos/${storyId}.jpg`,
      width: 800,
      height: 600,
    }),
  );
}

const base = {
  recipientName: "Mum",
  message: "Thinking of you from Nagasaki.",
  messageLang: "en",
  aiAssisted: false,
};

async function send(w: World, storyId: Id<"story">, extra: Partial<typeof base> = {}) {
  return await w.b.as("hana").mutation(api.postcards.create, {
    ...base,
    ...extra,
    items: [{ kind: "story", storyId }],
  });
}

describe("with the switch off", () => {
  it("answers not found to everyone, signed in or not, and writes nothing", async () => {
    postcardOn(false);
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const asHana = w.b.as("hana");
    expect(await errorCode(send(w, storyId))).toBe("not_found");
    expect(await errorCode(asHana.query(api.postcards.mine, {}))).toBe("not_found");
    expect(await errorCode(asHana.query(api.postcards.moments, {}))).toBe("not_found");
    expect(
      await errorCode(
        asHana.mutation(internal.postcards.beginDraft, {
          items: [{ kind: "story", storyId }],
          recipientName: "Mum",
          lang: "en",
        }),
      ),
    ).toBe("not_found");
    expect(await w.b.t.query(api.postcards.view, { code: "a".repeat(24) })).toBeNull();
    expect(await w.b.run((ctx) => ctx.db.query("postcard").collect())).toEqual([]);
  });

  it("stops a card made while it was on from opening", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const { code } = await send(w, storyId);
    expect(await w.b.t.query(api.postcards.view, { code })).not.toBeNull();
    postcardOn(false);
    expect(await w.b.t.query(api.postcards.view, { code })).toBeNull();
  });
});

describe("making a card", () => {
  it("is signed-in only", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    expect(
      await errorCode(
        w.b.t.mutation(api.postcards.create, { ...base, items: [{ kind: "story", storyId }] }),
      ),
    ).toBe("unauthenticated");
  });

  it("makes a code of 24 letters and digits with no look-alikes", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    expect((await send(w, storyId)).code).toMatch(CODE);
  });

  it("makes different codes each time", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const codes = new Set<string>();
    for (let i = 0; i < 4; i++) codes.add((await send(w, storyId)).code);
    expect(codes.size).toBe(4);
  });

  it("shows the recipient the card without an account: places, sender, words and photo", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    await photo(w.b, w.hana, w.first, storyId);
    await w.b.as("hana").mutation(api.checks.confirm, { placeId: w.second });
    const { code } = await w.b.as("hana").mutation(api.postcards.create, {
      ...base,
      aiAssisted: true,
      items: [
        { kind: "story", storyId },
        { kind: "stamp", placeId: w.second },
      ],
    });
    const card = await w.b.t.query(api.postcards.view, { code });
    expect(card).toMatchObject({
      recipientName: "Mum",
      message: "Thinking of you from Nagasaki.",
      aiAssisted: true,
      fromName: "Test Person (hana)",
    });
    expect(card?.places.map((p) => p.slug)).toEqual(["first", "second"]);
    expect(card?.places[0]?.excerpt?.text).toContain("older than the tram");
    expect(card?.places[0]?.photos).toEqual([
      { key: `photos/${storyId}.jpg`, width: 800, height: 600 },
    ]);
    expect(card?.places[1]?.excerpt).toBeUndefined();
    expect(card?.places[1]?.photos).toEqual([]);
    expect(card?.places[0]?.names).toContainEqual(
      expect.objectContaining({ lang: "en", value: "Test Shop" }),
    );
  });

  it("never shows a photo that is still waiting for a steward", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    await photo(w.b, w.hana, w.first, storyId, "waiting");
    const { code } = await send(w, storyId);
    const card = await w.b.t.query(api.postcards.view, { code });
    expect(card?.places[0]?.photos).toEqual([]);
    expect(card?.places[0]?.excerpt).toBeDefined();
  });

  it("refuses another member's story, and says nothing else about it", async () => {
    const w = await world();
    const hers = await story(w.b, w.hana, w.first);
    const asKenta = w.b.as("kenta");
    expect(
      await errorCode(
        asKenta.mutation(api.postcards.create, {
          ...base,
          items: [{ kind: "story", storyId: hers }],
        }),
      ),
    ).toBe("forbidden");
    expect(await w.b.run((ctx) => ctx.db.query("postcard").collect())).toEqual([]);
  });

  it("refuses a stamp the member does not hold", async () => {
    const w = await world();
    expect(
      await errorCode(
        w.b.as("hana").mutation(api.postcards.create, {
          ...base,
          items: [{ kind: "stamp", placeId: w.third }],
        }),
      ),
    ).toBe("forbidden");
  });

  it("refuses a story that is no longer showing, a demo place, and a place off the public map", async () => {
    const w = await world();
    const gone = await story(w.b, w.hana, w.first, { status: "hidden" });
    expect(await errorCode(send(w, gone))).toBe("invalid_input");
    const demo = await addPlace(w.b, { createdBy: w.hana, visibility: "demo_public" });
    const demoStory = await story(w.b, w.hana, demo);
    expect(await errorCode(send(w, demoStory))).toBe("invalid_input");
    const draft = await addPlace(w.b, { createdBy: w.steward, visibility: "draft" });
    const draftStory = await story(w.b, w.hana, draft);
    expect(await errorCode(send(w, draftStory))).toBe("invalid_input");
  });

  it("holds one to eight places, each once", async () => {
    const w = await world();
    const a = await story(w.b, w.hana, w.first);
    const asHana = w.b.as("hana");
    expect(await errorCode(asHana.mutation(api.postcards.create, { ...base, items: [] }))).toBe(
      "invalid_input",
    );
    expect(
      await errorCode(
        asHana.mutation(api.postcards.create, {
          ...base,
          items: [
            { kind: "story", storyId: a },
            { kind: "stamp", placeId: w.first },
          ],
        }),
      ),
    ).toBe("invalid_input");
    const places = [];
    for (let i = 0; i < 9; i++)
      places.push(await addPlace(w.b, { createdBy: w.steward, visibility: "public" }));
    for (const placeId of places) await w.b.as("hana").mutation(api.checks.confirm, { placeId });
    const nine = places.map((placeId) => ({ kind: "stamp" as const, placeId }));
    expect(await errorCode(asHana.mutation(api.postcards.create, { ...base, items: nine }))).toBe(
      "invalid_input",
    );
    expect(
      (await asHana.mutation(api.postcards.create, { ...base, items: nine.slice(0, 8) })).code,
    ).toMatch(CODE);
  });

  it("checks the words and the recipient", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    expect(await errorCode(send(w, storyId, { message: "  \n " }))).toBe("invalid_input");
    expect(await errorCode(send(w, storyId, { message: "あ".repeat(1201) }))).toBe("invalid_input");
    expect((await send(w, storyId, { message: "あ".repeat(1200) })).code).toMatch(CODE);
    expect(await errorCode(send(w, storyId, { recipientName: " " }))).toBe("invalid_input");
    expect(await errorCode(send(w, storyId, { recipientName: "x".repeat(41) }))).toBe(
      "invalid_input",
    );
    expect(await errorCode(send(w, storyId, { messageLang: "fr" }))).toBe("invalid_input");
  });

  it("keeps the member's text as text: control characters go, line breaks stay", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const { code } = await send(w, storyId, {
      message: "Hello\u0000 there\r\n\r\n\r\n\r\nSee you\u202e soon <b>x</b>",
      recipientName: "Mum\nand Dad",
    });
    const card = await w.b.t.query(api.postcards.view, { code });
    expect(card?.message).toBe("Hello there\n\nSee you soon <b>x</b>");
    expect(card?.recipientName).toBe("Mum and Dad");
  });

  it("needs the member to have seen the name shown on the card, and refuses a demo account", async () => {
    const w = await world();
    await addPerson(w.b, "newbie", "user", { nameConfirmed: false });
    const demo = await addPerson(w.b, "demo", "user", { isMock: true });
    const own = await story(w.b, w.hana, w.first);
    const mockStory = await w.b.run((ctx) =>
      ctx.db.insert("story", {
        placeId: w.first,
        authorPersonId: demo,
        body: "架空",
        lang: "ja",
        status: "live",
        isMock: true,
      }),
    );
    expect(
      await errorCode(
        w.b.as("newbie").mutation(api.postcards.create, {
          ...base,
          items: [{ kind: "stamp", placeId: w.first }],
        }),
      ),
    ).toBe("name_not_confirmed");
    expect(
      await errorCode(
        w.b.as("demo").mutation(api.postcards.create, {
          ...base,
          items: [{ kind: "story", storyId: mockStory }],
        }),
      ),
    ).toBe("forbidden");
    expect(own).toBeDefined();
  });

  it("limits a member to twenty a day and a hundred kept", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    for (let i = 0; i < 20; i++) await send(w, storyId);
    expect(await errorCode(send(w, storyId))).toBe("rate_limited");
    const w2 = await world();
    const s2 = await story(w2.b, w2.hana, w2.first);
    await w2.b.run(async (ctx) => {
      for (let i = 0; i < 100; i++)
        await ctx.db.insert("postcard", {
          code: `k${i}`.padEnd(24, "x"),
          senderPersonId: w2.hana,
          regionId: "nagasaki",
          recipientName: "Mum",
          message: "hi",
          messageLang: "en",
          aiAssisted: false,
          items: [{ kind: "stamp", placeId: w2.first }],
        });
    });
    expect(await errorCode(send(w2, s2))).toBe("conflict");
  });
});

describe("what the recipient sees stays in step with the sender's own stories", () => {
  it("shows no words and no photo once the story is removed, and keeps the place", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    await photo(w.b, w.hana, w.first, storyId);
    const { code } = await send(w, storyId);
    expect((await w.b.t.query(api.postcards.view, { code }))?.places[0]?.photos).toHaveLength(1);
    await w.b.as("hana").mutation(api.stories.remove, { storyId });
    const card = await w.b.t.query(api.postcards.view, { code });
    expect(card?.places).toHaveLength(1);
    expect(card?.places[0]).toMatchObject({ slug: "first", photos: [] });
    expect(card?.places[0]?.excerpt).toBeUndefined();
    const list = await w.b.as("hana").query(api.postcards.mine, {});
    expect(list[0]?.places[0]?.showing).toBe(false);
  });

  it("shows no words when a steward takes the story down", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const { code } = await send(w, storyId);
    await w.b.as("steward").mutation(api.stories.remove, { storyId });
    expect((await w.b.t.query(api.postcards.view, { code }))?.places[0]?.excerpt).toBeUndefined();
  });

  it("drops a place that has left the public map", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const other = await story(w.b, w.hana, w.second);
    const made = await w.b.as("hana").mutation(api.postcards.create, {
      ...base,
      items: [
        { kind: "story", storyId },
        { kind: "story", storyId: other },
      ],
    });
    await w.b.run((ctx) => ctx.db.patch("place", w.second, { visibility: "draft" }));
    const card = await w.b.t.query(api.postcards.view, { code: made.code });
    expect(card?.places.map((p) => p.slug)).toEqual(["first"]);
  });

  it("follows the sender's name as it is now", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const { code } = await send(w, storyId);
    await w.b.run((ctx) => ctx.db.patch("person", w.hana, { displayName: "Hana of Shinchi" }));
    expect((await w.b.t.query(api.postcards.view, { code }))?.fromName).toBe("Hana of Shinchi");
  });
});

describe("opening a link", () => {
  it("answers null for a wrong, short or odd code, and never throws", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    await send(w, storyId);
    for (const code of ["", "abc", "a".repeat(24), "A".repeat(24), "../".repeat(8), "0".repeat(24)])
      expect(await w.b.t.query(api.postcards.view, { code })).toBeNull();
  });
});

describe("deleting a card", () => {
  it("lets only the sender, and the link stops working at once", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const { code } = await send(w, storyId);
    const [row] = await w.b.as("hana").query(api.postcards.mine, {});
    expect(row?.code).toBe(code);
    expect(
      await errorCode(w.b.as("kenta").mutation(api.postcards.remove, { postcardId: row!._id })),
    ).toBe("forbidden");
    expect(
      await errorCode(w.b.as("steward").mutation(api.postcards.remove, { postcardId: row!._id })),
    ).toBe("forbidden");
    expect(await w.b.t.query(api.postcards.view, { code })).not.toBeNull();
    await w.b.as("hana").mutation(api.postcards.remove, { postcardId: row!._id });
    expect(await w.b.t.query(api.postcards.view, { code })).toBeNull();
    expect(await w.b.as("hana").query(api.postcards.mine, {})).toEqual([]);
    expect(
      await errorCode(w.b.as("hana").mutation(api.postcards.remove, { postcardId: row!._id })),
    ).toBe("not_found");
  });

  it("is signed-in only", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    await send(w, storyId);
    const [row] = await w.b.as("hana").query(api.postcards.mine, {});
    expect(await errorCode(w.b.t.mutation(api.postcards.remove, { postcardId: row!._id }))).toBe(
      "unauthenticated",
    );
  });

  it("goes when the sender deletes their account", async () => {
    vi.useFakeTimers();
    try {
      const b = newBackend(modules);
      const steward = await addPerson(b, "stella", "steward");
      const leaving = b.t.withIdentity({
        subject: "leaver",
        issuer: "https://clerk.test.invalid",
        name: "Aiko",
      });
      const member = await leaving.mutation(api.people.ensureCurrent, {});
      await leaving.mutation(api.people.confirmMyDisplayName, {});
      const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
      const storyId = await story(b, member, placeId);
      const { code } = await leaving.mutation(api.postcards.create, {
        ...base,
        items: [{ kind: "story", storyId }],
      });
      expect(await b.t.query(api.postcards.view, { code })).not.toBeNull();
      await leaving.mutation(api.people.deleteMine, {});
      // Closed in the first transaction, before the later steps have deleted the row.
      expect(await b.t.query(api.postcards.view, { code })).toBeNull();
      expect(await b.run((ctx) => ctx.db.query("postcard").collect())).toHaveLength(1);
      await b.t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await b.t.query(api.postcards.view, { code })).toBeNull();
      expect(await b.run((ctx) => ctx.db.query("postcard").collect())).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what the member can pick", () => {
  it("lists only their own stories and stamps, newest first, with the AI tick and photo count", async () => {
    const w = await world();
    const mine = await story(w.b, w.hana, w.first, { allowed: true });
    await photo(w.b, w.hana, w.first, mine);
    await story(
      w.b,
      (await w.b.run((ctx) => ctx.db.query("person").collect())).find(
        (p) => p.clerkUserId === "kenta",
      )!._id,
      w.third,
    );
    await w.b.as("hana").mutation(api.checks.confirm, { placeId: w.second });
    const list = await w.b.as("hana").query(api.postcards.moments, {});
    expect(list.map((m) => [m.kind, m.slug])).toEqual([
      ["stamp", "second"],
      ["story", "first"],
    ]);
    expect(list.find((m) => m.kind === "story")).toMatchObject({ aiMayRead: true, photoCount: 1 });
    expect(await errorCode(w.b.t.query(api.postcards.moments, {}))).toBe("unauthenticated");
  });

  it("leaves out a removed story and a demo place", async () => {
    const w = await world();
    await story(w.b, w.hana, w.first, { status: "hidden" });
    const demo = await addPlace(w.b, { createdBy: w.hana, visibility: "demo_public" });
    await story(w.b, w.hana, demo);
    expect(await w.b.as("hana").query(api.postcards.moments, {})).toEqual([]);
  });

  it("shows a member only their own cards", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    await send(w, storyId);
    expect(await w.b.as("kenta").query(api.postcards.mine, {})).toEqual([]);
    expect(await w.b.as("hana").query(api.postcards.mine, {})).toHaveLength(1);
  });
});

describe("the writing helper's gate", () => {
  const ai = () => {
    vi.stubEnv("AI_MODEL_WRITE_STORY", "claude-fictional-1");
    vi.stubEnv("ANTHROPIC_API_KEY", "fictional-key");
  };
  const ask = (w: World, items: unknown, extra: Record<string, unknown> = {}) =>
    w.b.as("hana").mutation(internal.postcards.beginDraft, {
      items: items as never,
      recipientName: "Mum",
      lang: "en",
      ...extra,
    });

  it("sends the words of a story only when its writer allowed AI to read it", async () => {
    ai();
    const w = await world();
    const ticked = await story(w.b, w.hana, w.first, { allowed: true, body: "Ticked words." });
    const plain = await story(w.b, w.hana, w.second, { body: "Private words." });
    const out = await ask(
      w,
      [
        { kind: "story", storyId: ticked },
        { kind: "story", storyId: plain },
      ],
      { note: "  we ate well  " },
    );
    expect(out.places).toEqual([
      { name: "Test Shop", nameJa: "テスト店", story: "Ticked words." },
      { name: "Test Shop", nameJa: "テスト店" },
    ]);
    expect(out.withheld).toBe(1);
    expect(out.note).toBe("we ate well");
    expect(JSON.stringify(out)).not.toContain("Private words");
  });

  it("gives a stamp's place name and nothing more", async () => {
    ai();
    const w = await world();
    await w.b.as("hana").mutation(api.checks.confirm, { placeId: w.first });
    const out = await ask(w, [{ kind: "stamp", placeId: w.first }]);
    expect(out.places).toEqual([{ name: "Test Shop", nameJa: "テスト店" }]);
    expect(out.withheld).toBe(0);
  });

  it("refuses another member's story, a signed-out caller, a demo account and the switch being off", async () => {
    ai();
    const w = await world();
    const hers = await story(w.b, w.hana, w.first, { allowed: true });
    expect(
      await errorCode(
        w.b.as("kenta").mutation(internal.postcards.beginDraft, {
          items: [{ kind: "story", storyId: hers }],
          recipientName: "Mum",
          lang: "en",
        }),
      ),
    ).toBe("forbidden");
    expect(
      await errorCode(
        w.b.t.mutation(internal.postcards.beginDraft, {
          items: [{ kind: "story", storyId: hers }],
          recipientName: "Mum",
          lang: "en",
        }),
      ),
    ).toBe("unauthenticated");
    postcardOn(false);
    expect(await errorCode(ask(w, [{ kind: "story", storyId: hers }]))).toBe("not_found");
  });

  it("says AI is not set up before it spends a slot", async () => {
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    expect(await errorCode(ask(w, [{ kind: "story", storyId }]))).toBe("conflict");
    expect(await w.b.run((ctx) => ctx.db.query("rateLimit").collect())).toEqual([]);
  });

  it("limits a member to five drafts a minute and records that one was asked for, not what", async () => {
    ai();
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first, {
      allowed: true,
      body: "Secret ramen words.",
    });
    for (let i = 0; i < 5; i++) await ask(w, [{ kind: "story", storyId }]);
    expect(await errorCode(ask(w, [{ kind: "story", storyId }]))).toBe("rate_limited");
    const audits = await w.b.run((ctx) => ctx.db.query("auditLog").collect());
    const mine = audits.filter((a) => a.action === "ai.postcard_draft_requested");
    expect(mine).toHaveLength(5);
    expect(JSON.stringify(mine)).not.toContain("ramen");
  });

  it("checks the note and the recipient", async () => {
    ai();
    const w = await world();
    const storyId = await story(w.b, w.hana, w.first);
    const items = [{ kind: "story", storyId }];
    expect(await errorCode(ask(w, items, { note: "x".repeat(301) }))).toBe("invalid_input");
    expect(await errorCode(ask(w, items, { recipientName: "" }))).toBe("invalid_input");
    expect(await errorCode(ask(w, items, { lang: "fr" }))).toBe("invalid_input");
  });
});

describe("who may call each function (the postcard's own authorization matrix)", () => {
  type Caller = "signedOut" | "hana" | "kenta" | "steward";
  const callers: Caller[] = ["signedOut", "hana", "kenta", "steward"];
  const stubAi = () => {
    vi.stubEnv("AI_MODEL_WRITE_STORY", "claude-fictional-1");
    vi.stubEnv("ANTHROPIC_API_KEY", "fictional-key");
  };

  /** What each caller gets from `fn` when the postcard is hana's: ok, or an error code. */
  async function outcomes(
    fn: (
      w: World,
      as: ReturnType<Backend["as"]> | Backend["t"],
      ids: {
        storyId: Id<"story">;
        postcardId: Id<"postcard">;
        code: string;
      },
    ) => Promise<unknown>,
  ) {
    const result: Record<string, string> = {};
    for (const caller of callers) {
      stubAi();
      const w = await world();
      const storyId = await story(w.b, w.hana, w.first, { allowed: true });
      const made = await send(w, storyId);
      const [row] = await w.b.as("hana").query(api.postcards.mine, {});
      const as = caller === "signedOut" ? w.b.t : w.b.as(caller);
      const code = await errorCode(fn(w, as, { storyId, postcardId: row!._id, code: made.code }));
      result[caller] = code === "did not fail" ? "ok" : code;
    }
    return result;
  }

  it("create, with someone's story: only its writer", async () => {
    expect(
      await outcomes((_w, as, { storyId }) =>
        as.mutation(api.postcards.create, { ...base, items: [{ kind: "story", storyId }] }),
      ),
    ).toEqual({
      signedOut: "unauthenticated",
      hana: "ok",
      kenta: "forbidden",
      steward: "forbidden",
    });
  });

  it("remove: only the sender", async () => {
    expect(
      await outcomes((_w, as, { postcardId }) => as.mutation(api.postcards.remove, { postcardId })),
    ).toEqual({
      signedOut: "unauthenticated",
      hana: "ok",
      kenta: "forbidden",
      steward: "forbidden",
    });
  });

  it("beginDraft, with someone's story: only its writer", async () => {
    expect(
      await outcomes((_w, as, { storyId }) =>
        as.mutation(internal.postcards.beginDraft, {
          items: [{ kind: "story", storyId }],
          recipientName: "Mum",
          lang: "en",
        }),
      ),
    ).toEqual({
      signedOut: "unauthenticated",
      hana: "ok",
      kenta: "forbidden",
      steward: "forbidden",
    });
  });

  it("mine and moments: any member, each seeing only their own; not a signed-out caller", async () => {
    for (const fn of [api.postcards.mine, api.postcards.moments]) {
      expect(await outcomes((_w, as) => as.query(fn, {}))).toEqual({
        signedOut: "unauthenticated",
        hana: "ok",
        kenta: "ok",
        steward: "ok",
      });
    }
  });

  it("view: anyone with the code, signed in or not", async () => {
    expect(
      await outcomes(async (_w, as, { code }) => {
        const card = await as.query(api.postcards.view, { code });
        if (card === null) throw new Error("no card");
      }),
    ).toEqual({ signedOut: "ok", hana: "ok", kenta: "ok", steward: "ok" });
  });
});
