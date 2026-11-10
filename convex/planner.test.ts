/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as languageModels from "../src/lib/ai/claim-extractor";
import { emptySubmit, idOf, scriptedModel, type Script } from "../tests/fixtures/planner";
import { addPerson, addPlace, errorCode, newBackend, type Backend } from "../tests/convex/fixtures";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PLANNER_PER_DAY, PLANNER_PER_MINUTE } from "./planner";
import * as region from "./lib/region";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const realRegionConfig = region.regionConfig;

/** As the region's file does once the planner is switched on (or left off). */
function setSwitches(features: { connector: boolean; planner: boolean; walk: boolean }) {
  vi.spyOn(region, "regionConfig").mockImplementation((id: string) => ({
    ...realRegionConfig(id),
    features,
  }));
}
const plannerOn = () => setSwitches({ connector: false, planner: true, walk: false });

/** As a region does once its launch pack is complete: real places show what members wrote. */
function completeLaunchPack() {
  vi.spyOn(region, "regionPolicy").mockReturnValue({
    ...region.regionPolicy("nagasaki"),
    realBusinessesDraftOnly: false,
  });
}

beforeEach(() => {
  vi.stubEnv("AI_MODEL_PLAN", "claude-sonnet-5-5");
  vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic-key");
  vi.stubEnv("META_API_KEY", "mock-meta-key");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const SHINCHI = { lat: 32.7415, lng: 129.8755 };
// Written by someone who did not tick the box that lets AI read their story.
const WRITTEN = "The old woman at the counter still folds every paper bag by hand.";
// Written by someone who did.
const TICKED = "On rainy days the owner hands out umbrellas with the bill.";
const PRIVATE_QUESTION = "Three stops near Shinchi, I am allergic to prawns and I like history";

async function world() {
  const b = newBackend(modules);
  const creator = await addPerson(b, "creator", "creator");
  const walker = await addPerson(b, "walker", "user");
  const writer = await addPerson(b, "writer", "user");
  const ticker = await addPerson(b, "ticker", "user");
  const places: Id<"place">[] = [];
  for (const [slug, lat] of [
    ["near-a", SHINCHI.lat],
    ["near-b", SHINCHI.lat + 0.001],
    ["near-c", SHINCHI.lat - 0.001],
  ] as const) {
    const placeId = await addPlace(b, {
      createdBy: creator,
      visibility: "public",
      isMock: false,
      category: "cafe",
      slug,
    });
    await b.run(async (ctx) => {
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
        .unique();
      await ctx.db.patch("pin", pin!._id, { lat, lng: SHINCHI.lng });
      await ctx.db.patch("place", placeId, { confirmedAt: 1 });
    });
    places.push(placeId);
  }
  // One story whose writer never ticked the box (the person asking may read it, the model may not)
  // and one whose writer did.
  await b.run(async (ctx) => {
    await ctx.db.insert("story", {
      placeId: places[0]!,
      authorPersonId: writer,
      body: WRITTEN,
      lang: "en",
      status: "live",
      isMock: false,
    });
    await ctx.db.insert("story", {
      placeId: places[1]!,
      authorPersonId: ticker,
      body: TICKED,
      lang: "en",
      status: "live",
      isMock: false,
      connectorAllowedAt: Date.now(),
    });
  });
  return { b, creator, walker, writer, places };
}

const baseRequest = (over: Record<string, unknown> = {}) => ({
  turns: [{ role: "user" as const, text: PRIVATE_QUESTION }],
  memory: { avoid: ["allergy:prawns"], interests: ["history"], done: [] },
  start: { kind: "neighbourhood" as const, id: "shinchi" },
  language: "en" as const,
  ...over,
});

/** Draw, open two stops, point at the ticked story (the page shows it once, not twice). */
function goodScript(): Script[] {
  return [
    () => [{ name: "suggest_walk", input: { stops: 3 } }],
    () => [
      { name: "get_place", input: { slug: "near-a" } },
      { name: "get_place", input: { slug: "near-b" } },
    ],
    ({ prompt }) => [
      {
        name: "submit_plan",
        input: { ...emptySubmit, stops: [{ slug: "near-b", quoteIds: [idOf(prompt, TICKED)] }] },
      },
    ],
  ];
}

async function counts(b: Backend) {
  return await b.run(async (ctx) => {
    const result: Record<string, number> = {};
    for (const table of Object.keys(schema.tables)) {
      result[table] = (await ctx.db.query(table as never).take(2000)).length;
    }
    return result;
  });
}

function spyModel(model: ReturnType<typeof scriptedModel>) {
  return vi.spyOn(languageModels, "createLanguageModel").mockReturnValue(model);
}

describe("the switch", () => {
  it("refuses everything while features.planner is off, signed in or not, and touches nothing", async () => {
    setSwitches({ connector: false, planner: false, walk: false });
    const { b } = await world();
    const factory = vi.spyOn(languageModels, "createLanguageModel");
    const before = await counts(b);
    expect(await errorCode(b.t.action(api.plannerActions.ask, baseRequest()))).toBe("not_found");
    expect(await errorCode(b.as("walker").action(api.plannerActions.ask, baseRequest()))).toBe(
      "not_found",
    );
    expect(await errorCode(b.as("walker").mutation(internal.planner.begin, {}))).toBe("not_found");
    // The draws it would use answer nothing either.
    expect(
      await errorCode(
        b.t.mutation(api.connector.walk, {
          regionId: "nagasaki",
          start: { kind: "neighbourhood", id: "shinchi" },
          count: 3,
          avoid: [],
          interests: [],
          adventurousness: "mixed",
        }),
      ),
    ).toBe("not_found");
    expect(factory).not.toHaveBeenCalled();
    expect(await counts(b)).toEqual(before);
  });

  it("with only the planner on, the draws answer too", async () => {
    plannerOn();
    const { b } = await world();
    const result = await b.t.mutation(api.connector.walk, {
      regionId: "nagasaki",
      start: { kind: "neighbourhood", id: "shinchi" },
      count: 3,
      avoid: [],
      interests: [],
      adventurousness: "mixed",
    });
    expect(result.ok).toBe(true);
  });
});

describe("who may ask", () => {
  it("a signed-out visitor, and a signed-in account with no record yet, are turned away before any model call", async () => {
    plannerOn();
    const { b } = await world();
    const factory = vi.spyOn(languageModels, "createLanguageModel");
    expect(await errorCode(b.t.action(api.plannerActions.ask, baseRequest()))).toBe(
      "unauthenticated",
    );
    expect(
      await errorCode(
        b.t
          .withIdentity({ subject: "stranger", issuer: "https://clerk.test.invalid" })
          .action(api.plannerActions.ask, baseRequest()),
      ),
    ).toBe("unauthenticated");
    expect(factory).not.toHaveBeenCalled();
  });

  it("says AI is not set up, without spending the account's slot", async () => {
    plannerOn();
    vi.stubEnv("AI_MODEL_PLAN", "");
    const { b } = await world();
    const before = await counts(b);
    await expect(
      b.as("walker").action(api.plannerActions.ask, baseRequest()),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: expect.stringContaining("AI_MODEL_PLAN") },
    });
    expect(await counts(b)).toEqual(before);
  });
});

describe("a question, on each provider", () => {
  async function ask(setting: string, key: Record<string, string>) {
    plannerOn();
    completeLaunchPack();
    for (const [name, value] of Object.entries(key)) vi.stubEnv(name, value);
    vi.stubEnv("AI_MODEL_PLAN", setting);
    const w = await world();
    const model = scriptedModel(goodScript());
    const factory = spyModel(model);
    const before = await counts(w.b);
    const reply = await w.b.as("walker").action(api.plannerActions.ask, baseRequest());
    return { ...w, reply, factory, before, model };
  }

  it("Claude: runs the tools against Noren's data and returns the checked answer", async () => {
    const { reply, factory, b, before, places, model } = await ask("claude-sonnet-5-5", {});
    expect(factory).toHaveBeenCalledExactlyOnceWith({
      provider: "anthropic",
      apiKey: "mock-anthropic-key",
      modelId: "claude-sonnet-5-5",
    });
    expect(reply.state).toBe("ai");
    expect(reply.walk!.stops).toHaveLength(3);
    expect(reply.walk!.stops.map((stop) => stop.place.slug).toSorted()).toEqual([
      "near-a",
      "near-b",
      "near-c",
    ]);
    // The saved allergy went to the draw, which said it cannot check it. The model never saw it.
    expect(reply.walk!.rulesNotChecked.map((rule) => rule.tag)).toEqual(["allergy:prawns"]);
    const nearA = reply.walk!.stops.find((stop) => stop.place.slug === "near-a")!;
    const nearB = reply.walk!.stops.find((stop) => stop.place.slug === "near-b")!;
    expect(nearA.place.name).toBe("Test Shop (テスト店)");
    // The person reads both stories under their stops, with the writers' names, as the page shows
    // them, whether or not the writer ticked the box. None is the AI's pick.
    expect(nearA.stories).toEqual([
      expect.objectContaining({ kind: "story", text: WRITTEN, by: "Test Person (writer)" }),
    ]);
    expect(nearB.stories).toEqual([
      expect.objectContaining({ kind: "story", text: TICKED, by: "Test Person (ticker)" }),
    ]);
    expect(nearA.quotes).toEqual([]);
    expect(nearB.quotes).toEqual([]);
    expect(reply.pickedByAi).toBe(false);
    // The model was sent the ticked story and its writer, and nothing of the other.
    const sent = JSON.stringify(model.doGenerateCalls);
    expect(sent).toContain(TICKED);
    expect(sent).toContain("Test Person (ticker)");
    expect(sent).not.toContain(WRITTEN);
    expect(sent).not.toContain("Test Person (writer)");

    // The draw recorded its anonymous exposure, one for each stop.
    const exposure = await b.run((ctx) => ctx.db.query("placeExposure").take(20));
    expect(exposure.map((row) => row.placeId).toSorted()).toEqual([...places].toSorted());
    expect(exposure.every((row) => row.count === 1)).toBe(true);

    // Nothing else was written: the account's two counters, the draw's two shared counters (no
    // account in them) and the exposure rows.
    const after = await counts(b);
    expect(after.rateLimit).toBe(before.rateLimit! + 4);
    expect(after.placeExposure).toBe(before.placeExposure! + 3);
    for (const [table, count] of Object.entries(after)) {
      if (table !== "rateLimit" && table !== "placeExposure") {
        expect(count, table).toBe(before[table]);
      }
    }
  });

  it("Meta: the same run with the Meta setting", async () => {
    const { reply, factory } = await ask("meta:muse-spark-1.3", {});
    expect(factory).toHaveBeenCalledExactlyOnceWith({
      provider: "meta",
      apiKey: "mock-meta-key",
      modelId: "muse-spark-1.3",
    });
    expect(reply.state).toBe("ai");
    expect(reply.walk!.stops).toHaveLength(3);
  });

  it("stores no part of the question, the memory or the answer", async () => {
    const { b } = await ask("claude-sonnet-5-5", {});
    const everything = await b.run(async (ctx) => {
      const rows: unknown[] = [];
      for (const table of Object.keys(schema.tables)) {
        rows.push(...(await ctx.db.query(table as never).take(2000)));
      }
      return JSON.stringify(rows);
    });
    for (const secret of ["prawns", "allergic", "history", PRIVATE_QUESTION]) {
      expect(everything).not.toContain(secret);
    }
    const counters = await b.run((ctx) => ctx.db.query("rateLimit").take(20));
    expect(counters.map((row) => Object.keys(row).toSorted())).toEqual(
      counters.map(() => ["_creationTime", "_id", "count", "key", "windowStart"]),
    );
    expect(
      counters.map((row) => row.key.replace(/[a-z0-9]{20,}$/, "<account>")).toSorted(),
    ).toEqual([
      "connector:draw:hour",
      "connector:draw:minute",
      "planner:day:<account>",
      "planner:minute:<account>",
    ]);
  });

  it("leaves out the places today's trip names", async () => {
    plannerOn();
    completeLaunchPack();
    const w = await world();
    spyModel(
      scriptedModel([
        () => [{ name: "suggest_walk", input: { stops: 3 } }],
        () => [{ name: "submit_plan", input: emptySubmit }],
      ]),
    );
    const reply = await w.b.as("walker").action(
      api.plannerActions.ask,
      baseRequest({
        memory: { avoid: [], interests: [], done: [{ label: "A shop", slug: "near-a" }] },
      }),
    );
    expect(reply.walk!.stops.map((stop) => stop.place.slug).toSorted()).toEqual([
      "near-b",
      "near-c",
    ]);
  });
});

describe("what the arguments may hold", () => {
  it("refuses a field that could carry a location, wherever it is put", async () => {
    plannerOn();
    const { b } = await world();
    const factory = vi.spyOn(languageModels, "createLanguageModel");
    const ask = (args: Record<string, unknown>) =>
      b.as("walker").action(api.plannerActions.ask, args as never);
    await expect(
      ask(
        baseRequest({ start: { kind: "neighbourhood", id: "shinchi", lat: 32.74, lng: 129.87 } }),
      ),
    ).rejects.toThrow();
    await expect(ask({ ...baseRequest(), lat: 32.74, lng: 129.87 })).rejects.toThrow();
    await expect(
      ask(baseRequest({ start: { kind: "coordinates", lat: 32.74, lng: 129.87 } })),
    ).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });

  it("refuses a request that is too big, before any model call", async () => {
    plannerOn();
    const { b } = await world();
    const factory = vi.spyOn(languageModels, "createLanguageModel");
    const tooLong = baseRequest({ turns: [{ role: "user", text: "x".repeat(701) }] });
    expect(await errorCode(b.as("walker").action(api.plannerActions.ask, tooLong))).toBe(
      "invalid_input",
    );
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("limits", () => {
  it("allows PLANNER_PER_MINUTE a minute, then PLANNER_PER_DAY a day, counting only the account", async () => {
    plannerOn();
    const { b } = await world();
    const begin = () => b.as("walker").mutation(internal.planner.begin, {});
    for (let n = 0; n < PLANNER_PER_MINUTE; n++) await begin();
    expect(await errorCode(begin())).toBe("rate_limited");

    // A new minute, over and over, until the day's allowance is gone.
    const real = Date.now;
    let clock = real();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    let allowed = PLANNER_PER_MINUTE;
    for (;;) {
      clock += 61_000;
      try {
        await begin();
        allowed++;
      } catch (error) {
        expect(await errorCode(Promise.reject(error))).toBe("rate_limited");
        break;
      }
    }
    expect(allowed).toBe(PLANNER_PER_DAY);

    // Another account is not held up by it.
    await addPerson(b, "other", "user");
    await b.as("other").mutation(internal.planner.begin, {});
  });
});

describe("when the model fails", () => {
  it("shows the draw that was made, without any AI text", async () => {
    plannerOn();
    completeLaunchPack();
    const w = await world();
    spyModel(
      scriptedModel([
        () => [{ name: "suggest_walk", input: { stops: 2 } }],
        () => {
          throw new TypeError("the provider fell over");
        },
      ]),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reply = await w.b.as("walker").action(api.plannerActions.ask, baseRequest());
    expect(reply).toMatchObject({
      state: "plain",
      intro: null,
      answers: [],
      proposals: [],
      pickedByAi: false,
    });
    expect(reply.walk!.stops).toHaveLength(2);
  });

  it("says it could not answer, and logs only the error's name", async () => {
    plannerOn();
    const w = await world();
    spyModel(
      scriptedModel([
        () => {
          throw new TypeError(`the provider echoed ${PRIVATE_QUESTION}`);
        },
      ]),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      w.b.as("walker").action(api.plannerActions.ask, baseRequest()),
    ).rejects.toMatchObject({
      data: { code: "conflict", message: "the planner could not answer; try again" },
    });
    const logged = log.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toMatch(/planner (model )?failed/);
    expect(logged).not.toContain("prawns");
    expect(logged).not.toContain("history");
  });
});
