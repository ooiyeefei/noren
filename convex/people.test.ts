/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { v, type GenericValidator } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addInterview,
  addOwner,
  addPerson,
  addPlace,
  addSource,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
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

/**
 * What account deletion does with every field that points at a person (FR-130, and "Account
 * deletion" in specs/002-noren-collection/data-model.md).
 * - deleted: the row goes.
 * - hidden: the row stays and comes off the site.
 * - kept: the row stays and points at the empty person row, so no name shows.
 * - asks a steward: interviews, consents and ownership depend on these, so `deleteMine` refuses
 *   someone who still holds them, even if a steward has since made them a plain user.
 * - stewards only: only a steward's action fills it, and a steward cannot delete themselves here.
 */
const DELETION_DECISIONS = {
  "personCollection.personId": "deleted",
  "story.authorPersonId": "deleted",
  "placeCheck.personId": "deleted",
  "note.authorPersonId": "deleted",
  "source.addedBy": "hidden",
  "place.createdBy": "kept",
  "place.confirmedBy": "kept",
  "placeName.confirmedBy": "kept",
  "pin.placedBy": "kept",
  "auditLog.actorPersonId": "kept",
  // A member who added a place may take a found post off it (sources.remove).
  "mentionCandidate.hiddenBy": "kept",
  "interview.interviewerId": "asks a steward",
  "interview.ownerPersonId": "asks a steward",
  "consent.recordedBy": "asks a steward",
  "transcript.createdBy": "asks a steward",
  "claim.authorId": "asks a steward",
  "claim.reviewerId": "asks a steward",
  "placeOwner.personId": "asks a steward",
  "person.verifiedBy": "stewards only",
  "placeCheck.reviewedBy": "stewards only",
  "placeOwner.verifiedBy": "stewards only",
  "openTextSnippet.approvedBy": "stewards only",
  "source.demoConsentBy": "stewards only",
  "translationCheck.decidedBy": "stewards only",
  "pageVersion.reviewedBy": "stewards only",
  "mentionCandidate.collectedBy": "stewards only",
  "placeStoryRun.requestedBy": "stewards only",
} as const;

function personFields(validator: GenericValidator, path: string): string[] {
  switch (validator.kind) {
    case "id":
      return validator.tableName === "person" ? [path] : [];
    case "object":
      return Object.entries(validator.fields).flatMap(([name, field]) =>
        personFields(field, `${path}.${name}`),
      );
    case "array":
      return personFields(validator.element, path);
    case "union":
      return validator.members.flatMap((member: GenericValidator) => personFields(member, path));
    case "record":
      return personFields(validator.value, path);
    default:
      return [];
  }
}

describe("what deletion does with each field that points at a person", () => {
  const fields = new Set(
    Object.entries(schema.tables).flatMap(([name, table]) => personFields(table.validator, name)),
  );

  it("finds a field however deep it sits", () => {
    const table = v.object({
      plain: v.id("person"),
      optional: v.optional(v.id("person")),
      inList: v.array(v.object({ who: v.id("person") })),
      inUnion: v.union(v.null(), v.id("person")),
      inRecord: v.record(v.string(), v.id("person")),
      elsewhere: v.id("place"),
    });
    expect(personFields(table, "t")).toEqual([
      "t.plain",
      "t.optional",
      "t.inList.who",
      "t.inUnion",
      "t.inRecord",
    ]);
    // Both members of this union table hold the field, and it still counts as one.
    expect(fields.has("translationCheck.decidedBy")).toBe(true);
  });

  it("has a decision for every field", () => {
    const decided: ReadonlySet<string> = new Set(Object.keys(DELETION_DECISIONS));
    expect(
      [...fields].filter((field) => !decided.has(field)),
      'A new v.id("person") field needs a decision: add a step to DELETION_STEPS in convex/people.ts if a member\'s rows must go, then record it in DELETION_DECISIONS above and in data-model.md',
    ).toEqual([]);
    expect(
      [...decided].filter((field) => !fields.has(field)),
      "These fields are no longer in the schema, so remove their decisions",
    ).toEqual([]);
  });
});

describe("people.deleteMine", () => {
  const SUBJECT = "aiko-leaving";
  const NAME = "Aiko Tanaka";
  const CHOSEN_NAME = "Aiko from Shinchi";

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A plain member who signed up the real way, beside a steward, another member and a public place. */
  async function world() {
    const b = newBackend(modules);
    const leaving = b.t.withIdentity({ subject: SUBJECT, issuer: ISSUER, name: NAME });
    const steward = await addPerson(b, "stella", "steward");
    const other = await addPerson(b, "ken", "user");
    const member = await leaving.mutation(api.people.ensureCurrent, {});
    const placeId = await addPlace(b, { createdBy: steward, visibility: "public" });
    return { b, leaving, steward, other, member, placeId };
  }
  const finish = (b: Backend) => b.t.finishAllScheduledFunctions(vi.runAllTimers);

  describe("in the first transaction", () => {
    it("empties the person's row, and nothing about them is left on it", async () => {
      const { b, leaving, member, steward } = await world();
      await b.run((ctx) =>
        ctx.db.patch("person", member, {
          publicProfileUrl: "https://example.com/aiko",
          verifiedAt: 1,
          verifiedBy: steward,
        }),
      );

      await leaving.mutation(api.people.deleteMine, {});

      const person = await b.run((ctx) => ctx.db.get("person", member));
      expect(person).toEqual({
        _id: member,
        _creationTime: person?._creationTime,
        tokenIdentifier: `deleted:${member}`,
        clerkUserId: `deleted:${member}`,
        role: "user",
        displayName: "Former member",
        isMock: false,
      });
      expect(await leaving.query(api.people.current, {})).toBeNull();
    });

    it("deletes the check-ins, panels and badges with it", async () => {
      const { b, leaving, member, other, placeId } = await world();
      const row = (personId: typeof member) =>
        b.run((ctx) =>
          ctx.db
            .query("personCollection")
            .withIndex("by_personId", (q) => q.eq("personId", personId))
            .first(),
        );
      const setId = await b.run((ctx) =>
        ctx.db.insert("collectionSet", {
          regionId: "nagasaki",
          neighbourhoodId: "shinchi",
          names: { ja: "新地", en: "Shinchi" },
          panelCount: 6,
          status: "live",
        }),
      );
      const mine = await row(member);
      await b.run((ctx) =>
        ctx.db.patch("personCollection", mine!._id, {
          visits: [{ placeId, setId, panelIndex: 0, day: "2026-11-06" }],
          badges: [{ setId, names: { ja: "新地", en: "Shinchi" }, finishedOn: "2026-11-06" }],
        }),
      );
      await b.run((ctx) =>
        ctx.db.insert("personCollection", { personId: other, visits: [], badges: [] }),
      );

      await leaving.mutation(api.people.deleteMine, {});

      expect(await row(member)).toBeNull();
      expect(await row(other)).not.toBeNull();
    });
  });

  it("deletes their stories and leaves other people's", async () => {
    const { b, leaving, placeId } = await world();
    await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });
    await b.as("ken").mutation(api.stories.add, { placeId, body: "Ken's story.", lang: "en" });

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const stories = await b.t.query(api.stories.listForPlace, { placeId });
    expect(stories.map(({ body }) => body)).toEqual(["Ken's story."]);
    const stored = await b.run((ctx) => ctx.db.query("story").take(10));
    expect(stored).toHaveLength(1);
  });

  it("clears the place's copy of whether it has people's stories", async () => {
    const { b, leaving, placeId } = await world();
    await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });
    expect((await b.run((ctx) => ctx.db.get("place", placeId)))?.hasPeopleStories).toBe(true);

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    expect((await b.run((ctx) => ctx.db.get("place", placeId)))?.hasPeopleStories).toBe(false);
  });

  it("hides the links they shared, and leaves other people's", async () => {
    const { b, leaving, member, other, placeId } = await world();
    const mine = await addSource(b, { placeId, addedBy: member });
    const theirs = await addSource(b, { placeId, addedBy: other });
    await b.run(async (ctx) => {
      await ctx.db.patch("source", mine, { sharedAt: 1, creatorNote: "My note.", noteLang: "en" });
      await ctx.db.patch("source", theirs, { sharedAt: 1 });
    });
    expect(await b.t.query(api.sources.listForPlace, { placeId })).toHaveLength(2);

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const shown = await b.t.query(api.sources.listForPlace, { placeId });
    expect(shown.map(({ _id }) => _id)).toEqual([theirs]);
    expect((await b.run((ctx) => ctx.db.get("source", mine)))?.status).toBe("hidden");
  });

  it("erases a found post they brought in, the way sources.remove does", async () => {
    const { b, leaving, member, placeId } = await world();
    const { sourceId, candidateId, translationId } = await b.run(async (ctx) => {
      const url = "https://example.com/found-post";
      const sourceId = await ctx.db.insert("source", {
        placeId,
        addedBy: member,
        origin: "story_finder",
        platform: "web",
        adapter: "website",
        url,
        canonicalUrl: url,
        status: "live",
        sharedAt: 1,
        excerpt: "架空の引用です。",
        excerptLang: "ja",
        isMock: false,
      });
      const translationId = await ctx.db.insert("sourceExcerptTranslation", {
        sourceId,
        lang: "en",
        text: "A fictional quote.",
        sourceText: "架空の引用です。",
        origin: "machine",
        modelVersion: "fictional-model",
      });
      await ctx.db.insert("placeStory", {
        placeId,
        sentences: [
          {
            en: "A fictional sentence.",
            ja: "架空の文です。",
            citations: [{ sourceId, words: "架空の引用" }],
          },
        ],
        postsRead: 1,
        writer: "fictional-writer",
        checker: "fictional-checker",
        publishedAt: 1,
      });
      const candidateId = await ctx.db.insert("mentionCandidate", {
        placeId,
        regionId: "nagasaki",
        platform: "web",
        url,
        canonicalUrl: url,
        text: "架空の投稿です。架空の引用です。",
        searchedFor: "テスト店",
        query: "テスト店",
        actorId: "fictional",
        runId: "fictional",
        collectionId: "fictional",
        authorKey: "example.com",
        collectedBy: member,
        status: "attached",
        sourceId,
        attachedAt: 1,
      });
      return { sourceId, candidateId, translationId };
    });

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    await b.run(async (ctx) => {
      const source = await ctx.db.get("source", sourceId);
      expect(source?.status).toBe("hidden");
      expect(source?.excerpt).toBeUndefined();
      expect(await ctx.db.get("sourceExcerptTranslation", translationId)).toBeNull();
      expect(await ctx.db.query("placeStory").first()).toBeNull();
      const candidate = await ctx.db.get("mentionCandidate", candidateId);
      expect(candidate).toMatchObject({ status: "hidden", text: "", hiddenBy: member });
    });
  });

  it("deletes their Still here presses and reports, and leaves other people's", async () => {
    const { b, leaving, other, placeId } = await world();
    await leaving.mutation(api.checks.confirm, { placeId });
    await leaving.mutation(api.checks.report, { placeId, problem: "closed", note: "Shuttered." });
    await b.as("ken").mutation(api.checks.confirm, { placeId });

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const checks = await b.run((ctx) => ctx.db.query("placeCheck").take(10));
    expect(checks.map(({ personId }) => personId)).toEqual([other]);
  });

  it("deletes their notes with each note's translations, and leaves other people's", async () => {
    const { b, leaving, member, other, placeId } = await world();
    const addNote = (authorPersonId: typeof member) =>
      b.run(async (ctx) => {
        const noteId = await ctx.db.insert("note", {
          placeId,
          authorPersonId,
          body: "架空のメモです。",
          lang: "ja",
          status: "visible",
          isMock: false,
        });
        await ctx.db.insert("noteTranslation", {
          noteId,
          lang: "en",
          text: "A fictional note.",
          origin: "machine",
        });
        return noteId;
      });
    await addNote(member);
    const theirs = await addNote(other);

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    await b.run(async (ctx) => {
      expect((await ctx.db.query("note").take(10)).map(({ _id }) => _id)).toEqual([theirs]);
      expect((await ctx.db.query("noteTranslation").take(10)).map(({ noteId }) => noteId)).toEqual([
        theirs,
      ]);
    });
  });

  it("keeps the places, pins and names they made, pointing at the empty row", async () => {
    const { b, leaving, member } = await world();
    const placeId = await addPlace(b, { createdBy: member, visibility: "public" });
    await b.run((ctx) =>
      ctx.db.patch("place", placeId, { confirmedAt: 1, confirmedBy: member, sharedAt: 1 }),
    );

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    await b.run(async (ctx) => {
      const place = await ctx.db.get("place", placeId);
      expect(place).toMatchObject({ createdBy: member, confirmedBy: member, visibility: "public" });
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
        .first();
      expect(pin?.placedBy).toBe(member);
      const names = await ctx.db
        .query("placeName")
        .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
        .take(10);
      expect(names.map(({ confirmedBy }) => confirmedBy)).toEqual([member, member]);
      expect((await ctx.db.get("person", member))?.displayName).toBe("Former member");
    });
    expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);
  });

  it("keeps the audit log, and an entry about them keeps no name", async () => {
    const { b, leaving, member, placeId } = await world();
    await leaving.mutation(api.checks.confirm, { placeId });
    await b.t.mutation(internal.people.setDisplayName, {
      personId: member,
      displayName: CHOSEN_NAME,
    });
    await b.as("stella").mutation(api.people.setRole, { personId: member, role: "creator" });
    await b.as("stella").mutation(api.people.setRole, { personId: member, role: "user" });

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const entries = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    const about = (action: string) => entries.filter((entry) => entry.action === action);
    expect(about("place.confirm")[0]?.actorPersonId).toBe(member);
    expect(about("person.set_display_name")).toHaveLength(1);
    expect(about("person.set_display_name")[0]?.targetId).toBe(member);
    expect(about("person.set_display_name")[0]?.diff).toBeUndefined();
    expect(about("person.set_role").map(({ diff }) => diff)).toEqual([
      { role: { from: "user", to: "creator" } },
      { role: { from: "creator", to: "user" } },
    ]);
  });

  it("leaves another person's audit entries as they were", async () => {
    const { b, leaving, other } = await world();
    await b.t.mutation(internal.people.setDisplayName, { personId: other, displayName: "Ken" });

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const entries = await b.run((ctx) => ctx.db.query("auditLog").take(20));
    expect(entries.find((entry) => entry.targetId === other)?.diff).toEqual({
      displayName: { from: "Test Person (ken)", to: "Ken" },
    });
  });

  it("leaves rate limit rows to expire, and they hold an id only", async () => {
    const { b, leaving, member, placeId } = await world();
    await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const limits = await b.run((ctx) => ctx.db.query("rateLimit").take(10));
    expect(limits.map(({ key }) => key)).toEqual([`contribution:story:${member}`]);
  });

  it("leaves no name or sign-in identity anywhere in the stored records (SC-107)", async () => {
    const { b, leaving, member, placeId } = await world();
    await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });
    await leaving.mutation(api.checks.confirm, { placeId });
    await addPlace(b, { createdBy: member, visibility: "public" });
    await b.t.mutation(internal.people.setDisplayName, {
      personId: member,
      displayName: CHOSEN_NAME,
    });
    const search = () =>
      b.run(async (ctx) => {
        const rows = [];
        for (const table of Object.keys(schema.tables) as (keyof typeof schema.tables)[])
          rows.push(...(await ctx.db.query(table).take(1000)));
        return JSON.stringify(rows);
      });
    expect(await search()).toContain(CHOSEN_NAME);
    expect(await search()).toContain(NAME);
    expect(await search()).toContain(SUBJECT);

    await leaving.mutation(api.people.deleteMine, {});
    await finish(b);

    const stored = await search();
    expect(stored).not.toContain(CHOSEN_NAME);
    expect(stored).not.toContain(NAME);
    expect(stored).not.toContain(SUBJECT);
  });

  describe("who may use it", () => {
    it("refuses someone who is signed out", async () => {
      const { b } = await world();
      expect(await errorCode(b.t.mutation(api.people.deleteMine, {}))).toBe("unauthenticated");
    });

    it.each(["creator", "business_owner", "steward"] as const)(
      "refuses a %s and changes nothing",
      async (role) => {
        const { b, leaving, member, placeId } = await world();
        await leaving.mutation(api.stories.add, { placeId, body: "A story.", lang: "en" });
        await b.run((ctx) => ctx.db.patch("person", member, { role }));

        expect(await errorCode(leaving.mutation(api.people.deleteMine, {}))).toBe("forbidden");
        await finish(b);

        const person = await b.run((ctx) => ctx.db.get("person", member));
        expect(person).toMatchObject({ role, displayName: NAME, clerkUserId: SUBJECT });
        expect(await b.t.query(api.stories.listForPlace, { placeId })).toHaveLength(1);
      },
    );

    it("refuses a plain user who still holds an interview, because its consent depends on them", async () => {
      const { b, leaving, member, placeId } = await world();
      await addInterview(b, { placeId, interviewerId: member });

      expect(await errorCode(leaving.mutation(api.people.deleteMine, {}))).toBe("forbidden");
      expect((await b.run((ctx) => ctx.db.get("person", member)))?.clerkUserId).toBe(SUBJECT);
    });

    it("refuses a plain user who still owns a place", async () => {
      const { b, leaving, member, steward, placeId } = await world();
      await addOwner(b, placeId, member, steward);
      await b.run((ctx) => ctx.db.patch("person", member, { role: "user" }));

      expect(await errorCode(leaving.mutation(api.people.deleteMine, {}))).toBe("forbidden");
      expect((await b.run((ctx) => ctx.db.get("person", member)))?.clerkUserId).toBe(SUBJECT);
    });
  });

  describe("pressing again after the Clerk step failed", () => {
    it("succeeds and changes nothing when the row is already empty", async () => {
      const { b, leaving, member } = await world();
      await leaving.mutation(api.people.deleteMine, {});
      await finish(b);
      const before = await b.run((ctx) => ctx.db.query("person").take(10));

      await leaving.mutation(api.people.deleteMine, {});
      await finish(b);

      expect(await b.run((ctx) => ctx.db.query("person").take(10))).toEqual(before);
      expect((await b.run((ctx) => ctx.db.get("person", member)))?.displayName).toBe(
        "Former member",
      );
    });

    it("empties the new row a page load made in between, and nothing comes back", async () => {
      const { b, leaving, member, placeId } = await world();
      await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });
      await leaving.mutation(api.people.deleteMine, {});
      await finish(b);

      // Clerk's user still exists, so the account menu signs them up afresh on the next page.
      const fresh = await leaving.mutation(api.people.ensureCurrent, {});
      expect(fresh).not.toBe(member);
      expect(await leaving.query(api.stampBook.mine, {})).toEqual([]);
      expect(await b.t.query(api.stories.listForPlace, { placeId })).toEqual([]);

      await leaving.mutation(api.people.deleteMine, {});
      await finish(b);

      const people = await b.run((ctx) => ctx.db.query("person").take(10));
      const emptied = people.filter(({ displayName }) => displayName === "Former member");
      expect(emptied.map(({ _id }) => _id).toSorted()).toEqual([member, fresh].toSorted());
      expect(people.some(({ clerkUserId }) => clerkUserId === SUBJECT)).toBe(false);
      const collections = await b.run((ctx) => ctx.db.query("personCollection").take(10));
      expect(collections.filter(({ personId }) => personId === fresh)).toEqual([]);
    });
  });

  describe("people.continueDeletion", () => {
    it("works in small batches and schedules itself until every row is done", async () => {
      const { b, leaving, member, placeId } = await world();
      const STORIES = 45;
      await b.run(async (ctx) => {
        for (let i = 0; i < STORIES; i++)
          await ctx.db.insert("story", {
            placeId,
            authorPersonId: member,
            body: `Fictional story ${i}.`,
            lang: "en",
            status: "live",
            isMock: false,
          });
      });
      const remaining = async () => (await b.run((ctx) => ctx.db.query("story").take(100))).length;

      await leaving.mutation(api.people.deleteMine, {});
      expect(await remaining()).toBe(STORIES);

      vi.runOnlyPendingTimers();
      await b.t.finishInProgressScheduledFunctions();
      const afterOneRun = await remaining();
      expect(afterOneRun).toBeLessThan(STORIES);
      expect(afterOneRun).toBeGreaterThan(0);

      await finish(b);
      expect(await remaining()).toBe(0);
    });

    it("can be run again by hand, which changes nothing that was already done", async () => {
      const { b, leaving, member, placeId } = await world();
      await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });
      await leaving.mutation(api.people.deleteMine, {});
      await finish(b);

      await b.t.mutation(internal.people.continueDeletion, {
        personId: member,
        step: 0,
        cursor: null,
      });
      await finish(b);

      expect(await b.run((ctx) => ctx.db.query("story").take(10))).toEqual([]);
    });

    it("refuses a person whose deletion has not started, so a stray call cannot remove their rows", async () => {
      const { b, leaving, member, placeId } = await world();
      await leaving.mutation(api.stories.add, { placeId, body: "A fictional story.", lang: "en" });

      expect(
        await errorCode(
          b.t.mutation(internal.people.continueDeletion, {
            personId: member,
            step: 0,
            cursor: null,
          }),
        ),
      ).toBe("conflict");
      await finish(b);

      expect(await b.t.query(api.stories.listForPlace, { placeId })).toHaveLength(1);
    });
  });
});
