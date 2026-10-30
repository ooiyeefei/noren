/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal, api } from "./_generated/api";
import schema from "./schema";

// The sign-in and role functions, called through the real `mutation` exports so the write gate in
// convex/lib/gate.ts runs too. The mock backend does not prove the gate on a deployment: that
// check is the first real sign-in (task T016, V3).

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://clerk.test.invalid";

type Claims = { name?: string; nickname?: string; email?: string };

/** The code of the error a call fails with, or what happened instead. */
async function errorCode(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    const code = (error as { data?: { code?: string } }).data?.code;
    return code ?? `threw without a code: ${String(error)}`;
  }
  return "did not fail";
}

function backend() {
  const t = convexTest(schema, modules);
  const as = (subject: string, claims: Claims = {}) =>
    t.withIdentity({ subject, issuer: ISSUER, ...claims });
  const signUp = (subject: string, claims: Claims = {}) =>
    as(subject, claims).mutation(api.people.ensureCurrent, {});
  const makeSteward = async (subject: string) => {
    const id = await signUp(subject);
    await t.mutation(internal.people.bootstrapSteward, { clerkUserId: subject });
    return id;
  };
  const roleOf = async (id: Awaited<ReturnType<typeof signUp>>) =>
    (await t.run((ctx) => ctx.db.get("person", id)))?.role;
  const auditFor = (action: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query("auditLog").take(100)).filter((entry) => entry.action === action),
    );
  return { t, as, signUp, makeSteward, roleOf, auditFor };
}

describe("people.ensureCurrent", () => {
  it("creates a plain user from the verified identity", async () => {
    const { t, signUp } = backend();
    const id = await signUp("aiko", { name: "Aiko Tanaka" });
    const person = await t.run((ctx) => ctx.db.get("person", id));
    expect(person).toMatchObject({
      tokenIdentifier: `${ISSUER}|aiko`,
      clerkUserId: "aiko",
      role: "user",
      displayName: "Aiko Tanaka",
      isMock: false,
    });
  });

  it("returns the same person every time and never undoes what a steward set", async () => {
    const { t, as, signUp, makeSteward, roleOf } = backend();
    await makeSteward("stella");
    const id = await signUp("aiko");
    await as("stella").mutation(api.people.setRole, { personId: id, role: "creator" });

    expect(await signUp("aiko")).toBe(id);
    expect(await roleOf(id)).toBe("creator");
    const rows = await t.run((ctx) => ctx.db.query("person").take(10));
    expect(rows.filter((row) => row.clerkUserId === "aiko")).toHaveLength(1);
  });

  it("refuses a caller who is not signed in", async () => {
    const { t } = backend();
    expect(await errorCode(t.mutation(api.people.ensureCurrent, {}))).toBe("unauthenticated");
  });

  it("names a person by name, then nickname, and never by email", async () => {
    const { t, signUp } = backend();
    const cases: [string, Claims, string][] = [
      ["a", { name: "  Aiko  " }, "Aiko"],
      ["b", { nickname: "aiko-chan" }, "aiko-chan"],
      ["c", { name: "   ", email: "someone@example.invalid" }, "New member"],
      ["d", {}, "New member"],
    ];
    for (const [subject, claims, expected] of cases) {
      const id = await signUp(subject, claims);
      expect((await t.run((ctx) => ctx.db.get("person", id)))?.displayName).toBe(expected);
    }
  });
});

describe("people.current", () => {
  it("is null for a visitor who is signed out or has no record yet", async () => {
    const { t, as } = backend();
    expect(await t.query(api.people.current, {})).toBeNull();
    expect(await as("ghost").query(api.people.current, {})).toBeNull();
  });

  it("gives a signed-in person their name and role and nothing that identifies them", async () => {
    const { as, signUp } = backend();
    await signUp("aiko", { name: "Aiko Tanaka", email: "aiko@example.invalid" });
    expect(await as("aiko").query(api.people.current, {})).toEqual({
      displayName: "Aiko Tanaka",
      role: "user",
      isMock: false,
    });
  });
  it("current reports a mock person as mock", async () => {
    const { t, as, signUp } = backend();
    const id = await signUp("mock-person", { name: "Demo person" });
    await t.run((ctx) => ctx.db.patch("person", id, { isMock: true }));
    expect(await as("mock-person").query(api.people.current, {})).toEqual({
      displayName: "Demo person",
      role: "user",
      isMock: true,
    });
  });
});

describe("people.setRole", () => {
  it("lets a steward set a role and records who changed what", async () => {
    const { as, signUp, makeSteward, roleOf, auditFor } = backend();
    const stewardId = await makeSteward("stella");
    const id = await signUp("aiko");

    await as("stella").mutation(api.people.setRole, { personId: id, role: "creator" });

    expect(await roleOf(id)).toBe("creator");
    const entries = await auditFor("person.set_role");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorKind: "person",
      actorPersonId: stewardId,
      targetType: "person",
      targetId: id,
      diff: { role: { from: "user", to: "creator" } },
    });
  });

  it("writes nothing when the role is already that role", async () => {
    const { as, signUp, makeSteward, auditFor } = backend();
    await makeSteward("stella");
    const id = await signUp("aiko");
    await as("stella").mutation(api.people.setRole, { personId: id, role: "user" });
    expect(await auditFor("person.set_role")).toHaveLength(0);
  });

  it("is for stewards only", async () => {
    const { t, as, signUp, makeSteward, roleOf } = backend();
    await makeSteward("stella");
    const creatorId = await signUp("creator");
    const targetId = await signUp("aiko");
    await as("stella").mutation(api.people.setRole, { personId: creatorId, role: "creator" });

    const attempt = (caller: ReturnType<typeof as>) =>
      errorCode(caller.mutation(api.people.setRole, { personId: targetId, role: "creator" }));
    expect(await attempt(as("creator"))).toBe("forbidden");
    expect(await attempt(as("aiko"))).toBe("forbidden");
    expect(await attempt(t)).toBe("unauthenticated");
    // Signed in with Clerk but never registered, so there is no person row to hold a role.
    expect(await attempt(as("ghost"))).toBe("unauthenticated");
    expect(await roleOf(targetId)).toBe("user");
  });

  it("never makes a steward and never changes one", async () => {
    const { as, signUp, makeSteward, roleOf } = backend();
    const stewardId = await makeSteward("stella");
    const id = await signUp("aiko");

    await expect(
      // @ts-expect-error `steward` is not an assignable role
      as("stella").mutation(api.people.setRole, { personId: id, role: "steward" }),
    ).rejects.toThrow(/Validator error|does not match validator/);
    expect(await roleOf(id)).toBe("user");

    expect(
      await errorCode(
        as("stella").mutation(api.people.setRole, { personId: stewardId, role: "user" }),
      ),
    ).toBe("conflict");
    expect(await roleOf(stewardId)).toBe("steward");
  });

  it("reports a person who does not exist", async () => {
    const { t, as, signUp, makeSteward } = backend();
    await makeSteward("stella");
    const id = await signUp("aiko");
    await t.run((ctx) => ctx.db.delete("person", id));
    expect(
      await errorCode(as("stella").mutation(api.people.setRole, { personId: id, role: "creator" })),
    ).toBe("not_found");
  });
});

describe("people.bootstrapSteward", () => {
  it("makes a steward and records it as a system action", async () => {
    const { t, signUp, roleOf, auditFor } = backend();
    const id = await signUp("stella");

    await t.mutation(internal.people.bootstrapSteward, { clerkUserId: "stella" });

    expect(await roleOf(id)).toBe("steward");
    const [entry, ...rest] = await auditFor("person.bootstrap_steward");
    expect(rest).toHaveLength(0);
    expect(entry).toMatchObject({
      actorKind: "system",
      targetId: id,
      diff: { role: { from: "user", to: "steward" } },
    });
    expect(entry?.actorPersonId).toBeUndefined();
  });

  it("changes nothing the second time", async () => {
    const { t, makeSteward, auditFor } = backend();
    await makeSteward("stella");
    await t.mutation(internal.people.bootstrapSteward, { clerkUserId: "stella" });
    expect(await auditFor("person.bootstrap_steward")).toHaveLength(1);
  });

  it("says to sign in first when the person has no record yet", async () => {
    const { t } = backend();
    expect(
      await errorCode(t.mutation(internal.people.bootstrapSteward, { clerkUserId: "nobody" })),
    ).toBe("not_found");
  });

  it("gives the new steward the powers of one", async () => {
    const { as, signUp, makeSteward, roleOf } = backend();
    await makeSteward("stella");
    const id = await signUp("aiko");
    await as("stella").mutation(api.people.setRole, { personId: id, role: "business_owner" });
    expect(await roleOf(id)).toBe("business_owner");
  });
});
