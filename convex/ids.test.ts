/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function backend() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const personId = await ctx.db.insert("person", {
      tokenIdentifier: "https://clerk.test.invalid|mock-creator",
      clerkUserId: "mock-creator",
      displayName: "Mock creator",
      role: "creator",
      isMock: true,
    });
    const placeId = await ctx.db.insert("place", {
      regionId: "nagasaki",
      slug: "mock-place",
      visibility: "draft",
      createdBy: personId,
      isMock: true,
    });
    const interviewId = await ctx.db.insert("interview", {
      placeId,
      interviewerId: personId,
      language: "ja",
      status: "consent_pending",
      isMock: true,
    });
    return { placeId, interviewId };
  });
  return { t, ...ids };
}

describe("ids.normalize", () => {
  it("returns real place and interview IDs unchanged without authentication", async () => {
    const { t, placeId, interviewId } = await backend();
    expect(await t.query(api.ids.normalize, { table: "place", id: placeId })).toBe(placeId);
    expect(await t.query(api.ids.normalize, { table: "interview", id: interviewId })).toBe(
      interviewId,
    );
  });

  it.each(["place", "interview"] as const)("returns null for malformed %s IDs", async (table) => {
    const t = convexTest(schema, modules);
    for (const id of ["not-a-place-id", ""])
      expect(await t.query(api.ids.normalize, { table, id })).toBeNull();
  });

  it("rejects a valid ID from the other table", async () => {
    const { t, interviewId } = await backend();
    expect(await t.query(api.ids.normalize, { table: "place", id: interviewId })).toBeNull();
  });

  it("normalizes a deleted record's ID without revealing existence", async () => {
    const { t, placeId } = await backend();
    await t.run((ctx) => ctx.db.delete("place", placeId));
    expect(await t.query(api.ids.normalize, { table: "place", id: placeId })).toBe(placeId);
  });
});
