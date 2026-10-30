/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { addPerson, errorCode, newBackend } from "../tests/convex/fixtures";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const b = newBackend(modules);
  await addPerson(b, "steward", "steward");
  return b;
}
describe("stewardPeople.list", () => {
  it("a steward lists everyone with role and mock flag", async () => {
    const b = await setup();
    const id = await addPerson(b, "creator", "creator", { isMock: true });
    const people = await b.as("steward").query(api.stewardPeople.list, {});
    expect(people).toHaveLength(2);
    expect(people).toContainEqual({
      _id: id,
      displayName: "Test Person (creator)",
      role: "creator",
      isMock: true,
    });
  });
  it("the role filter uses the role", async () => {
    const b = await setup();
    await addPerson(b, "creator", "creator");
    const owner = await addPerson(b, "owner", "business_owner");
    expect(await b.as("steward").query(api.stewardPeople.list, { role: "business_owner" })).toEqual(
      [expect.objectContaining({ _id: owner, role: "business_owner" })],
    );
  });
  it("a creator, an owner, a user and a signed-out caller are refused (forbidden / unauthenticated)", async () => {
    const b = await setup();
    for (const role of ["creator", "business_owner", "user"] as const) {
      await addPerson(b, role, role);
      expect(await errorCode(b.as(role).query(api.stewardPeople.list, {}))).toBe("forbidden");
    }
    expect(await errorCode(b.t.query(api.stewardPeople.list, {}))).toBe("unauthenticated");
  });
  it("no token identifier or Clerk id is returned", async () => {
    const b = await setup();
    await addPerson(b, "private", "user");
    const people = await b.as("steward").query(api.stewardPeople.list, {});
    for (const person of people)
      expect(Object.keys(person).sort()).toEqual(["_id", "displayName", "isMock", "role"]);
  });
  it("at most 200 rows", async () => {
    const b = await setup();
    await b.run(async (ctx) => {
      for (let index = 0; index < 205; index++)
        await ctx.db.insert("person", {
          tokenIdentifier: `bounded-${index}`,
          clerkUserId: `bounded-${index}`,
          displayName: "Mock person",
          role: "creator",
          isMock: true,
        });
    });
    expect(await b.as("steward").query(api.stewardPeople.list, {})).toHaveLength(200);
    expect(await b.as("steward").query(api.stewardPeople.list, { role: "creator" })).toHaveLength(
      200,
    );
  });
});
