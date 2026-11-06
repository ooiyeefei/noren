/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
      nameConfirmed: false,
      joinedAt: expect.any(Number),
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
      nameConfirmed: true,
      joinedAt: expect.any(Number),
    });
  });

  it("nameConfirmed matches what a share would meet: a steward is never asked", async () => {
    const { as, signUp, makeSteward } = backend();
    await makeSteward("stella");
    await signUp("aiko");
    expect((await as("stella").query(api.people.current, {}))?.nameConfirmed).toBe(true);
    expect((await as("aiko").query(api.people.current, {}))?.nameConfirmed).toBe(false);
    await as("aiko").mutation(api.people.confirmMyDisplayName, {});
    expect((await as("aiko").query(api.people.current, {}))?.nameConfirmed).toBe(true);
  });
});

describe("a member's own display name (FR-131)", () => {
  it("starts unconfirmed, even with a name from the sign-in provider, and a later sign-in leaves it", async () => {
    const { t, as, signUp } = backend();
    const id = await signUp("aiko", { name: "Aiko Tanaka" });
    expect((await t.run((ctx) => ctx.db.get("person", id)))?.nameConfirmedAt).toBeUndefined();
    await as("aiko").mutation(api.people.confirmMyDisplayName, {});
    const confirmedAt = (await t.run((ctx) => ctx.db.get("person", id)))?.nameConfirmedAt;
    expect(confirmedAt).toEqual(expect.any(Number));
    await signUp("aiko", { name: "Aiko T" });
    expect(await t.run((ctx) => ctx.db.get("person", id))).toMatchObject({
      displayName: "Aiko Tanaka",
      nameConfirmedAt: confirmedAt,
    });
  });

  it("setMyDisplayName changes only the caller's own name and confirms it", async () => {
    const { t, as, signUp } = backend();
    const aiko = await signUp("aiko", { name: "Aiko Tanaka" });
    const ben = await signUp("ben", { name: "Ben" });
    await as("aiko").mutation(api.people.setMyDisplayName, { displayName: "  Lantern fan  " });
    expect(await t.run((ctx) => ctx.db.get("person", aiko))).toMatchObject({
      displayName: "Lantern fan",
      nameConfirmedAt: expect.any(Number),
    });
    expect(await t.run((ctx) => ctx.db.get("person", ben))).toMatchObject({ displayName: "Ben" });
    expect((await t.run((ctx) => ctx.db.get("person", ben)))?.nameConfirmedAt).toBeUndefined();
  });

  it("the name rule is 1 to 80 characters and no @", async () => {
    const { t, as, signUp } = backend();
    const id = await signUp("aiko", { name: "Aiko" });
    const set = (displayName: string) =>
      as("aiko").mutation(api.people.setMyDisplayName, { displayName });
    for (const bad of ["", "   ", "a".repeat(81), "aiko@example.invalid"])
      expect(await errorCode(set(bad))).toBe("invalid_input");
    expect((await t.run((ctx) => ctx.db.get("person", id)))?.nameConfirmedAt).toBeUndefined();
    await set("a".repeat(80));
    await set("あ");
    expect((await t.run((ctx) => ctx.db.get("person", id)))?.displayName).toBe("あ");
  });

  it("keeps no name in the audit log, because that outlives a deleted account", async () => {
    const { as, signUp, auditFor } = backend();
    const id = await signUp("aiko", { name: "Aiko Tanaka" });
    await as("aiko").mutation(api.people.setMyDisplayName, { displayName: "Lantern fan" });
    const entries = await auditFor("person.set_my_display_name");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorPersonId: id, targetId: id });
    expect(JSON.stringify(entries)).not.toMatch(/Aiko|Lantern/);
  });

  it("saving the same confirmed name again writes nothing", async () => {
    const { as, signUp, auditFor } = backend();
    await signUp("aiko", { name: "Aiko" });
    const set = () =>
      as("aiko").mutation(api.people.setMyDisplayName, { displayName: "Lantern fan" });
    await set();
    await set();
    expect(await auditFor("person.set_my_display_name")).toHaveLength(1);
  });

  it("confirming keeps the name shown, once, and takes the fallback name too", async () => {
    const { t, as, signUp } = backend();
    const id = await signUp("aiko");
    await as("aiko").mutation(api.people.confirmMyDisplayName, {});
    const first = await t.run((ctx) => ctx.db.get("person", id));
    expect(first).toMatchObject({
      displayName: "New member",
      nameConfirmedAt: expect.any(Number),
    });
    await as("aiko").mutation(api.people.confirmMyDisplayName, {});
    expect((await t.run((ctx) => ctx.db.get("person", id)))?.nameConfirmedAt).toBe(
      first?.nameConfirmedAt,
    );
  });

  it("will not confirm a provider's name that breaks the rule, such as an email typed as a name", async () => {
    const { t, as, signUp } = backend();
    const id = await signUp("aiko", { name: "aiko@example.invalid" });
    expect(await errorCode(as("aiko").mutation(api.people.confirmMyDisplayName, {}))).toBe(
      "invalid_input",
    );
    expect((await t.run((ctx) => ctx.db.get("person", id)))?.nameConfirmedAt).toBeUndefined();
    await as("aiko").mutation(api.people.setMyDisplayName, { displayName: "Aiko" });
    expect((await as("aiko").query(api.people.current, {}))?.nameConfirmed).toBe(true);
  });

  it("refuses a caller who is signed out, and a demo account, whose name is its label", async () => {
    const { t, as, signUp } = backend();
    expect(await errorCode(t.mutation(api.people.confirmMyDisplayName, {}))).toBe(
      "unauthenticated",
    );
    expect(
      await errorCode(t.mutation(api.people.setMyDisplayName, { displayName: "Anyone" })),
    ).toBe("unauthenticated");
    const id = await signUp("demo", { name: "Demo person" });
    await t.run((ctx) => ctx.db.patch("person", id, { isMock: true }));
    expect(
      await errorCode(as("demo").mutation(api.people.setMyDisplayName, { displayName: "Real" })),
    ).toBe("forbidden");
    expect(await errorCode(as("demo").mutation(api.people.confirmMyDisplayName, {}))).toBe(
      "forbidden",
    );
  });
});

describe("people.backfillNameConfirmed", () => {
  const run = (t: ReturnType<typeof backend>["t"]) =>
    t.mutation(internal.people.backfillNameConfirmed, { cursor: null });
  const person = (t: ReturnType<typeof backend>["t"], id: Id<"person">) =>
    t.run((ctx) => ctx.db.get("person", id));

  it("confirms members who already shared a story, a post or a place, and leaves the rest to the form", async () => {
    vi.useFakeTimers();
    try {
      const { t, signUp, makeSteward } = backend();
      const steward = await makeSteward("stella");
      const storyteller = await signUp("storyteller");
      const removed = await signUp("removed-story");
      const linker = await signUp("linker");
      const placer = await signUp("placer");
      const silent = await signUp("silent");
      const drafter = await signUp("drafter");
      const unsharedLink = await signUp("unshared-link");
      const demo = await signUp("demo");
      await t.run(async (ctx) => {
        await ctx.db.patch("person", demo, { isMock: true });
        const place = (personId: Id<"person">, slug: string, sharedAt?: number) =>
          ctx.db.insert("place", {
            regionId: "nagasaki",
            slug,
            visibility: "draft",
            createdBy: personId,
            isMock: false,
            ...(sharedAt === undefined ? {} : { sharedAt }),
          });
        const placeId = await place(steward, "test-place");
        const story = (authorPersonId: Id<"person">, status: "live" | "hidden") =>
          ctx.db.insert("story", {
            placeId,
            authorPersonId,
            body: "架空の話。",
            lang: "ja",
            status,
            isMock: false,
          });
        await story(storyteller, "live");
        await story(removed, "hidden");
        await story(demo, "live");
        const source = (addedBy: Id<"person">, url: string, sharedAt?: number) =>
          ctx.db.insert("source", {
            placeId,
            adapter: "link_card",
            platform: "web",
            url,
            canonicalUrl: url,
            status: "live",
            addedBy,
            isMock: false,
            ...(sharedAt === undefined ? {} : { sharedAt }),
          });
        await source(linker, "https://example.com/shared", 1);
        await source(unsharedLink, "https://example.com/unshared");
        await place(placer, "shared-place", 1);
        await place(drafter, "draft-place");
      });
      expect(await run(t)).toEqual({ confirmed: 4, isDone: true });
      for (const id of [storyteller, removed, linker, placer])
        expect((await person(t, id))?.nameConfirmedAt).toEqual(expect.any(Number));
      // Their name has never been on a page, so the form shows it first (FR-131).
      for (const id of [silent, drafter, unsharedLink, steward, demo])
        expect((await person(t, id))?.nameConfirmedAt).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is safe to run again, and keeps a name someone chose", async () => {
    const { t, as, signUp } = backend();
    const id = await signUp("aiko", { name: "Aiko" });
    await as("aiko").mutation(api.people.setMyDisplayName, { displayName: "Lantern fan" });
    const before = await person(t, id);
    expect(await run(t)).toEqual({ confirmed: 0, isDone: true });
    expect(await person(t, id)).toEqual(before);
  });

  it("carries on across pages until every person is seen", async () => {
    vi.useFakeTimers();
    try {
      const { t } = backend();
      const ids = await t.run(async (ctx) => {
        const steward = await ctx.db.insert("person", {
          tokenIdentifier: "t|steward",
          clerkUserId: "steward",
          role: "steward",
          displayName: "Steward",
          isMock: false,
        });
        const placeId = await ctx.db.insert("place", {
          regionId: "nagasaki",
          slug: "test-place",
          visibility: "draft",
          createdBy: steward,
          isMock: false,
        });
        const made = [];
        for (let n = 0; n < 150; n++) {
          const id = await ctx.db.insert("person", {
            tokenIdentifier: `t|member-${n}`,
            clerkUserId: `member-${n}`,
            role: "user",
            displayName: `Member ${n}`,
            isMock: false,
          });
          await ctx.db.insert("story", {
            placeId,
            authorPersonId: id,
            body: "架空の話。",
            lang: "ja",
            status: "live",
            isMock: false,
          });
          made.push(id);
        }
        return made;
      });
      expect(await run(t)).toMatchObject({ isDone: false });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      for (const id of ids)
        expect((await person(t, id))?.nameConfirmedAt).toEqual(expect.any(Number));
    } finally {
      vi.useRealTimers();
    }
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

describe("setDisplayName", () => {
  it("changes the shown name and refuses an email address", async () => {
    const { t, signUp } = backend();
    const personId = await signUp("user_fictional");
    await t.mutation(internal.people.setDisplayName, { personId, displayName: " Aiko Tanaka " });
    expect((await t.run((ctx) => ctx.db.get("person", personId)))?.displayName).toBe("Aiko Tanaka");
    expect(
      await errorCode(
        t.mutation(internal.people.setDisplayName, { personId, displayName: "aiko@example.test" }),
      ),
    ).toBe("invalid_input");
  });
});
