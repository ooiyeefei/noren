/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { currentPerson, requireRole } from "./lib/auth";
import { triggers } from "./lib/gate";
import { canReadPlace, readablePlaces } from "./lib/visibility";
import schema from "./schema";
import type { Role } from "../src/lib/domain/constants";

// The authorisation matrix of contracts/http-api.md: who may read which place, and which role a
// function demands. The people are real `person` rows and the callers carry real identities, so
// `currentPerson` is exercised too.

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://clerk.test.invalid";

const VIEWERS = [
  "signedOut",
  "user",
  "creatorA",
  "creatorB",
  "ownerA",
  "ownerB",
  "steward",
] as const;
type Viewer = (typeof VIEWERS)[number];

/** What each viewer may read of each place, in VIEWERS order (T = yes, F = no). */
const CAN_READ = {
  draftA: "FFTFTFT", // made by creatorA, owned by ownerA
  draftB: "FFFTFFT", // made by creatorB, no owner
  draftC: "FFFFFTT", // made by the steward, owned by ownerB
  pilot: "FTTTTTT",
  demo: "TTTTTTT",
  public: "TTTTTTT",
  legacy: "FFTFTFT", // invalid demo basis follows draft ownership
  elsewhere: "TTTTTTT", // demo_public, in another region
} as const;
type PlaceName = keyof typeof CAN_READ;

async function world() {
  const t = convexTest(schema, modules);
  const run = <T>(fn: (ctx: MutationCtx) => Promise<T>) => t.run((ctx) => fn(triggers.wrapDB(ctx)));

  const person = (name: string, role: Role) =>
    run((ctx) =>
      ctx.db.insert("person", {
        tokenIdentifier: `${ISSUER}|${name}`,
        clerkUserId: name,
        role,
        displayName: name,
        isMock: false,
      }),
    );
  const ids = {
    user: await person("user", "user"),
    creatorA: await person("creatorA", "creator"),
    creatorB: await person("creatorB", "creator"),
    ownerA: await person("ownerA", "business_owner"),
    ownerB: await person("ownerB", "business_owner"),
    steward: await person("steward", "steward"),
  };

  let slug = 0;
  const place = (
    createdBy: Id<"person">,
    visibility: Doc<"place">["visibility"],
    regionId = "nagasaki",
  ) =>
    run((ctx) =>
      ctx.db.insert("place", {
        regionId,
        slug: `place-${++slug}`,
        visibility,
        kind: visibility === "demo_public" ? "landmark" : undefined,
        demoPublicBasis: visibility === "demo_public" ? "fictional" : undefined,
        createdBy,
        isMock: visibility === "demo_public",
      }),
    );
  const places = {
    draftA: await place(ids.creatorA, "draft"),
    draftB: await place(ids.creatorB, "draft"),
    draftC: await place(ids.steward, "draft"),
    pilot: await place(ids.creatorA, "pilot"),
    demo: await place(ids.steward, "demo_public"),
    public: await place(ids.creatorA, "public"),
    legacy: await t.run((ctx) =>
      ctx.db.insert("place", {
        regionId: "nagasaki",
        slug: "legacy",
        visibility: "demo_public",
        createdBy: ids.creatorA,
        isMock: true,
      }),
    ),
    elsewhere: await place(ids.steward, "demo_public", "kuala-lumpur"),
  };
  for (const [placeId, personId] of [
    [places.draftA, ids.ownerA],
    [places.legacy, ids.ownerA],
    [places.draftC, ids.ownerB],
  ] as const) {
    await run((ctx) =>
      ctx.db.insert("placeOwner", { placeId, personId, verifiedBy: ids.steward, verifiedAt: 0 }),
    );
  }

  /** A caller: signed out, or signed in as one of the people above. */
  const as = (viewer: Viewer | "ghost") =>
    viewer === "signedOut" ? t : t.withIdentity({ subject: viewer, issuer: ISSUER });
  const doc = async (name: PlaceName) => {
    const found = await t.run((ctx) => ctx.db.get("place", places[name]));
    if (found === null) throw new Error(`fixture place ${name} is missing`);
    return found;
  };
  return { t, run, ids, places, as, doc };
}

/** The role the call returns, or the code or message it fails with. */
async function outcome(work: Promise<{ role: Role }>): Promise<string> {
  try {
    return (await work).role;
  } catch (error) {
    const code = (error as { data?: { code?: string } }).data?.code;
    return code ?? `threw: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe("canReadPlace", () => {
  for (const [name, expected] of Object.entries(CAN_READ) as [PlaceName, string][]) {
    it(`gives each viewer the right answer for ${name}`, async () => {
      const { as, doc } = await world();
      const place = await doc(name);
      const actual = await Promise.all(
        VIEWERS.map(async (viewer) =>
          (await as(viewer).run(async (ctx) => canReadPlace(ctx, await currentPerson(ctx), place)))
            ? "T"
            : "F",
        ),
      );
      expect(actual.join("")).toBe(expected);
    });
  }

  it("lets a person who was demoted from creator still read the drafts they made", async () => {
    // The draft rule names the person who made the place (`createdBy`), not the creator role.
    const { run, ids, as, doc } = await world();
    await run((ctx) => ctx.db.patch("person", ids.creatorA, { role: "user" }));
    const draftA = await doc("draftA");
    expect(
      await as("creatorA").run(async (ctx) => canReadPlace(ctx, await currentPerson(ctx), draftA)),
    ).toBe(true);
  });

  it("a demoted owner cannot read or list the draft despite a retained ownership row", async () => {
    const { run, ids, as, doc, places } = await world();
    await run((ctx) => ctx.db.patch("person", ids.ownerA, { role: "user" }));
    const draft = await doc("draftA");
    await as("ownerA").run(async (ctx) => {
      const viewer = await currentPerson(ctx);
      expect(await canReadPlace(ctx, viewer, draft)).toBe(false);
      expect(
        (await readablePlaces(ctx, viewer, { regionId: "nagasaki" })).map((place) => place._id),
      ).not.toContain(places.draftA);
    });
  });
});

describe("readablePlaces", () => {
  it("returns exactly the places canReadPlace allows, for every viewer", async () => {
    const { t, as } = await world();
    const everyPlace = await t.run((ctx) =>
      ctx.db
        .query("place")
        .withIndex("by_regionId_and_visibility", (q) => q.eq("regionId", "nagasaki"))
        .take(100),
    );
    for (const viewer of VIEWERS) {
      const { listed, allowed } = await as(viewer).run(async (ctx) => {
        const me = await currentPerson(ctx);
        const listedPlaces = await readablePlaces(ctx, me, { regionId: "nagasaki" });
        const allowedIds: Id<"place">[] = [];
        for (const place of everyPlace) {
          if (await canReadPlace(ctx, me, place)) allowedIds.push(place._id);
        }
        return { listed: listedPlaces.map((place) => place._id), allowed: allowedIds };
      });
      expect(new Set(listed), viewer).toEqual(new Set(allowed));
      expect(listed.length, `${viewer} sees no place twice`).toBe(new Set(listed).size);
    }
  });

  it("stays inside the region it was asked about", async () => {
    const { places, as } = await world();
    const listed = await as("steward").run(async (ctx) =>
      readablePlaces(ctx, await currentPerson(ctx), { regionId: "kuala-lumpur" }),
    );
    expect(listed.map((place) => place._id)).toEqual([places.elsewhere]);
  });

  it("caps each visibility at the limit", async () => {
    const { run, ids, as } = await world();
    for (let i = 0; i < 3; i++) {
      await run((ctx) =>
        ctx.db.insert("place", {
          regionId: "kuala-lumpur",
          slug: `extra-${i}`,
          visibility: "demo_public",
          kind: "landmark",
          demoPublicBasis: "fictional",
          createdBy: ids.steward,
          isMock: true,
        }),
      );
    }
    const listed = await as("signedOut").run(async (ctx) =>
      readablePlaces(ctx, null, { regionId: "kuala-lumpur", limit: 2 }),
    );
    expect(listed).toHaveLength(2);
  });
});

describe("requireRole", () => {
  it("admits only a steward when only a steward is listed", async () => {
    const { as } = await world();
    const ask = (viewer: Viewer | "ghost") =>
      outcome(as(viewer).run((ctx) => requireRole(ctx, ["steward"])));
    expect(await ask("steward")).toBe("steward");
    expect(await ask("creatorA")).toBe("forbidden");
    expect(await ask("ownerA")).toBe("forbidden");
    expect(await ask("user")).toBe("forbidden");
    expect(await ask("signedOut")).toBe("unauthenticated");
    // A valid Clerk token whose person row has not been created yet.
    expect(await ask("ghost")).toBe("unauthenticated");
  });

  it("lets a steward do everything a creator can, and no more", async () => {
    const { as, places } = await world();
    const asCreator = (viewer: Viewer) =>
      outcome(as(viewer).run((ctx) => requireRole(ctx, ["creator"])));
    expect(await asCreator("creatorA")).toBe("creator");
    expect(await asCreator("steward")).toBe("steward");
    expect(await asCreator("user")).toBe("forbidden");
    expect(await asCreator("ownerA")).toBe("forbidden");

    // Confirming a claim is the owner's alone: a steward does not inherit it.
    const asOwner = (viewer: Viewer, placeId: Id<"place">) =>
      outcome(as(viewer).run((ctx) => requireRole(ctx, ["business_owner"], { placeId })));
    expect(await asOwner("steward", places.draftA)).toBe("forbidden");
  });

  it("admits an owner only for the place they own", async () => {
    const { as, places } = await world();
    const ask = (viewer: Viewer, placeId: Id<"place">) =>
      outcome(as(viewer).run((ctx) => requireRole(ctx, ["business_owner"], { placeId })));
    expect(await ask("ownerA", places.draftA)).toBe("business_owner");
    expect(await ask("ownerA", places.draftC)).toBe("forbidden");
    expect(await ask("ownerB", places.draftA)).toBe("forbidden");
    expect(await ask("ownerB", places.draftC)).toBe("business_owner");
    expect(await ask("creatorA", places.draftA)).toBe("forbidden");
    expect(await ask("signedOut", places.draftA)).toBe("unauthenticated");
  });

  it("stops admitting an owner who has been moved to another role", async () => {
    const { run, ids, as, places } = await world();
    await run((ctx) => ctx.db.patch("person", ids.ownerA, { role: "user" }));
    expect(
      await outcome(
        as("ownerA").run((ctx) => requireRole(ctx, ["business_owner"], { placeId: places.draftA })),
      ),
    ).toBe("forbidden");
  });

  it("fails for every caller when business_owner is listed without a place", async () => {
    const { as } = await world();
    for (const viewer of ["steward", "user", "ownerA"] as const) {
      const result = await outcome(as(viewer).run((ctx) => requireRole(ctx, ["business_owner"])));
      expect(result, viewer).toContain("placeId");
    }
  });
});
