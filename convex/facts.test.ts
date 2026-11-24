/// <reference types="vite/client" />
import type { ApiFromModules } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addPerson, addPlace, addSource, errorCode, newBackend } from "../tests/convex/fixtures";
import { api as generatedApi } from "./_generated/api";

vi.mock("./lib/region", async (original) => ({
  ...(await original<typeof import("./lib/region")>()),
  factsOn: vi.fn(() => true),
}));

import { factsOn } from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const api = generatedApi as typeof generatedApi &
  ApiFromModules<{ facts: typeof import("./facts") }>;
const regionId = "malaysia-west";
const key = "steps_at_door";
const day = "2026-11-24";
const now = Date.parse("2026-11-23T16:30:00Z");

beforeEach(() => {
  vi.stubEnv("REGIONS_PREVIEW", regionId);
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.mocked(factsOn).mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const b = newBackend(modules);
  const member = await addPerson(b, "member", "user");
  const steward = await addPerson(b, "steward", "steward");
  const demo = await addPerson(b, "demo", "user", { isMock: true });
  const placeId = await addPlace(b, { createdBy: steward, regionId, visibility: "public" });
  const args = { placeId, key, value: "yes" as const };
  return { b, member, steward, demo, placeId, args };
}

describe("practical facts", () => {
  it("reports the region's local day and replaces only the caller's previous report", async () => {
    const { b, placeId, args } = await setup();
    const member = b.as("member");
    const factId = await member.mutation(api.facts.report, args);
    await b.as("steward").mutation(api.facts.report, args);
    expect(await member.mutation(api.facts.report, { ...args, value: "no" })).toBe(factId);
    expect(await member.query(api.facts.forPlace, { placeId })).toEqual([
      expect.objectContaining({
        key,
        value: "yes",
        reporterName: "Test Person (steward)",
        addedByMe: false,
      }),
      expect.objectContaining({
        _id: factId,
        key,
        value: "no",
        basis: "member",
        reporterName: "Test Person (member)",
        addedByMe: true,
        day,
        isOld: false,
      }),
    ]);
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toContainEqual(
      expect.objectContaining({ action: "fact.report", targetId: factId, diff: { value: "no" } }),
    );
  });

  it("requires sign-in, the feature switch, a readable place and a key in its region", async () => {
    const { b, steward, args, placeId } = await setup();
    const member = b.as("member");
    expect(await errorCode(b.t.mutation(api.facts.report, args))).toBe("unauthenticated");
    expect(await errorCode(member.mutation(api.facts.report, { ...args, key: "unknown" }))).toBe(
      "invalid_input",
    );
    const homePlaceId = await addPlace(b, { createdBy: steward, visibility: "public" });
    expect(
      await errorCode(member.mutation(api.facts.report, { ...args, placeId: homePlaceId })),
    ).toBe("invalid_input");
    const draftId = await addPlace(b, { createdBy: steward, regionId });
    expect(await errorCode(member.mutation(api.facts.report, { ...args, placeId: draftId }))).toBe(
      "not_found",
    );
    await b.as("steward").mutation(api.facts.report, { ...args, placeId: draftId });
    expect(await member.query(api.facts.forPlace, { placeId: draftId })).toEqual([]);
    await member.mutation(api.facts.report, args);
    vi.stubEnv("REGIONS_PREVIEW", "");
    expect(await member.query(api.facts.forPlace, { placeId })).toEqual([]);
    expect(await errorCode(member.mutation(api.facts.report, args))).toBe("not_found");
    vi.stubEnv("REGIONS_PREVIEW", regionId);
    vi.mocked(factsOn).mockReturnValue(false);
    expect(await errorCode(member.mutation(api.facts.report, args))).toBe("not_found");
  });

  it("keeps reports on the corresponding side of the demo boundary", async () => {
    const { b, demo, args } = await setup();
    const demoPlaceId = await addPlace(b, { createdBy: demo, regionId, visibility: "demo_public" });
    expect(await errorCode(b.as("demo").mutation(api.facts.report, args))).toBe("forbidden");
    expect(
      await errorCode(b.as("member").mutation(api.facts.report, { ...args, placeId: demoPlaceId })),
    ).toBe("forbidden");
    await b.as("demo").mutation(api.facts.report, { ...args, placeId: demoPlaceId });
    expect(await b.t.query(api.facts.forPlace, { placeId: demoPlaceId })).toEqual([
      expect.objectContaining({ isMock: true, reporterName: "Test Person (demo)" }),
    ]);
  });

  it("lets the writer remove their report and a steward hide a report", async () => {
    const { b, args, placeId, steward } = await setup();
    const member = b.as("member");
    const factId = await member.mutation(api.facts.report, args);
    expect(await errorCode(b.as("steward").mutation(api.facts.remove, { factId }))).toBe(
      "not_found",
    );
    expect(await errorCode(member.mutation(api.facts.hide, { factId, reason: "reviewed" }))).toBe(
      "forbidden",
    );
    await member.mutation(api.facts.remove, { factId });
    expect(await b.t.query(api.facts.forPlace, { placeId })).toEqual([]);
    const nextId = await member.mutation(api.facts.report, args);
    expect(nextId).not.toBe(factId);
    await b.as("steward").mutation(api.facts.hide, { factId: nextId, reason: "reviewed" });
    expect(await b.t.query(api.facts.forPlace, { placeId })).toEqual([]);
    expect(await b.run((ctx) => ctx.db.get("placeFact", factId))).toMatchObject({
      status: "removed",
    });
    expect(await b.run((ctx) => ctx.db.get("placeFact", nextId))).toMatchObject({
      status: "hidden",
    });
    expect(await b.run((ctx) => ctx.db.query("auditLog").take(10))).toContainEqual(
      expect.objectContaining({ action: "fact.hide", targetId: nextId, actorPersonId: steward }),
    );
  });

  it("limits writes to 30 in a day without changing the place, its counts or its order", async () => {
    const { b, args, placeId, steward } = await setup();
    await addPlace(b, { createdBy: steward, regionId, visibility: "public" });
    const readPlaces = () => b.run((ctx) => ctx.db.query("place").take(10));
    const before = await readPlaces();
    const member = b.as("member");
    for (let i = 0; i < 30; i++) await member.mutation(api.facts.report, args);
    expect(await errorCode(member.mutation(api.facts.report, args))).toBe("rate_limited");
    expect(await readPlaces()).toEqual(before);
    expect(await b.run((ctx) => ctx.db.query("placeCheck").take(1))).toEqual([]);
    expect(await b.t.query(api.facts.forPlace, { placeId })).toHaveLength(1);
    await b.as("steward").mutation(api.facts.report, args);
    vi.setSystemTime(now + 24 * 60 * 60 * 1000 + 1000);
    await member.mutation(api.facts.report, args);
  });

  it("returns a found post's visible source and quote and marks it old in local time", async () => {
    const { b, args, placeId, steward } = await setup();
    const url = "https://example.com/steps";
    const sourceId = await addSource(b, { placeId, addedBy: steward, url });
    const quote = "There were steps at the door.";
    const factId = await b.run(async (ctx) => {
      await ctx.db.patch("source", sourceId, {
        origin: "story_finder",
        sharedAt: now,
        authorHandle: "test-writer",
      });
      return ctx.db.insert("placeFact", {
        ...args,
        regionId,
        basis: "post",
        sourceId,
        quote,
        day: "2025-11-23",
        status: "live",
        isMock: false,
      });
    });
    expect(await b.t.query(api.facts.forPlace, { placeId })).toEqual([
      expect.objectContaining({
        _id: factId,
        basis: "post",
        isOld: true,
        source: expect.objectContaining({ url, authorHandle: "test-writer" }),
        quote,
      }),
    ]);
    await b.run((ctx) => ctx.db.patch("source", sourceId, { status: "hidden" }));
    expect(await b.t.query(api.facts.forPlace, { placeId })).toEqual([]);
  });

  it("returns at most 60 live records", async () => {
    const { b, args, placeId } = await setup();
    await b.run(async (ctx) => {
      for (let i = 0; i < 61; i++) {
        const personId = await ctx.db.insert("person", {
          tokenIdentifier: `fixture:${i}`,
          clerkUserId: `fixture:${i}`,
          displayName: `Test person ${i}`,
          role: "user",
          isMock: false,
        });
        await ctx.db.insert("placeFact", {
          ...args,
          regionId,
          basis: "member",
          personId,
          day,
          status: "live",
          isMock: false,
        });
      }
    });
    expect(await b.t.query(api.facts.forPlace, { placeId })).toHaveLength(60);
  });
});
