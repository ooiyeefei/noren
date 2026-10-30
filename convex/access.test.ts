/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import nagasaki from "../regions/nagasaki.json";
import {
  ISSUER,
  addClaim,
  addCorrectedTranscript,
  addDisputePair,
  addInterview,
  addOwner,
  addPage,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
  ruleOf,
} from "../tests/convex/fixtures";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canEditPlace,
  canManagePlace,
  canSeeSource,
  isPublicDemoPlace,
  isPubliclyReadablePlace,
  isPublicSafeClaim,
  isVerifiedOwner,
  loadReadablePlace,
  mayJoinPublicDemo,
  placeHasOwner,
  placeKind,
  requireEditablePlace,
  requireInterviewer,
  requireInterviewReader,
} from "./lib/access";
import { currentPerson } from "./lib/auth";
import { appError } from "./lib/errors";

const modules = import.meta.glob("./**/*.ts");
const VIEWERS = [
  "signedOut",
  "user",
  "creatorA",
  "creatorB",
  "ownerA",
  "steward",
  "mockCreator",
] as const;
type ViewerName = (typeof VIEWERS)[number];

async function world() {
  const b = newBackend(modules);
  const ids = {
    user: await addPerson(b, "user", "user"),
    creatorA: await addPerson(b, "creatorA", "creator"),
    creatorB: await addPerson(b, "creatorB", "creator"),
    ownerA: await addPerson(b, "ownerA", "business_owner"),
    steward: await addPerson(b, "steward", "steward"),
    mockCreator: await addPerson(b, "mockCreator", "creator", { isMock: true }),
  };
  const placeA = await addPlace(b, { createdBy: ids.creatorA });
  const placeB = await addPlace(b, { createdBy: ids.creatorB });
  const demo = await addPlace(b, {
    createdBy: ids.mockCreator,
    visibility: "demo_public",
    isMock: true,
  });
  await addOwner(b, placeA, ids.ownerA, ids.steward);
  const interviewId = await addInterview(b, { placeId: placeA, interviewerId: ids.creatorA });
  const as = (viewer: ViewerName | "ghost") => (viewer === "signedOut" ? b.t : b.as(viewer));
  const placeDoc = async (id: Id<"place">): Promise<Doc<"place">> => {
    const place = await b.t.run((ctx) => ctx.db.get("place", id));
    if (place === null) throw new Error("fixture place is missing");
    return place;
  };
  return { b, ids, placeA, placeB, demo, interviewId, as, placeDoc };
}

describe("place policy", () => {
  it("placeKind treats unset as business", async () => {
    const { placeDoc, placeA } = await world();
    const place = await placeDoc(placeA);
    expect(place.kind).toBeUndefined();
    expect(placeKind(place)).toBe("business");
    expect(placeKind({ ...place, kind: "landmark" })).toBe("landmark");
  });

  it("mayJoinPublicDemo and isPublicDemoPlace require a consistent recorded basis", async () => {
    const { placeDoc, placeA } = await world();
    const place = await placeDoc(placeA);
    for (const visibility of ["draft", "pilot", "demo_public", "public"] as const) {
      for (const kind of [undefined, "business", "landmark"] as const) {
        for (const isMock of [false, true]) {
          for (const demoPublicBasis of [undefined, "fictional"] as const) {
            const row = { ...place, visibility, kind, isMock, demoPublicBasis };
            const allowed =
              visibility === "demo_public" && demoPublicBasis === "fictional" && isMock;
            expect(isPublicDemoPlace(row), JSON.stringify(row)).toBe(allowed);
            const publiclyReadable = allowed || (visibility === "public" && !isMock);
            expect(isPubliclyReadablePlace(row), JSON.stringify(row)).toBe(publiclyReadable);
            expect(mayJoinPublicDemo(row), JSON.stringify(row)).toBe(publiclyReadable);
          }
        }
      }
    }
  });

  it("canManagePlace admits the steward, creator and verified owner only", async () => {
    const { as, placeDoc, placeA } = await world();
    const place = await placeDoc(placeA);
    for (const viewer of VIEWERS) {
      expect(
        await as(viewer).run(async (ctx) => canManagePlace(ctx, await currentPerson(ctx), place)),
        viewer,
      ).toBe(["creatorA", "ownerA", "steward"].includes(viewer));
    }
  });

  it("canEditPlace admits the steward and creator of the place, but not the owner", async () => {
    const { as, placeDoc, placeA } = await world();
    const place = await placeDoc(placeA);
    for (const viewer of VIEWERS) {
      expect(
        await as(viewer).run(async (ctx) => canEditPlace(await currentPerson(ctx), place)),
        viewer,
      ).toBe(["creatorA", "steward"].includes(viewer));
    }
  });

  it("checks ownership for the exact person and place", async () => {
    const { b, ids, placeA, placeB } = await world();
    await b.t.run(async (ctx) => {
      expect(await isVerifiedOwner(ctx, ids.ownerA, placeA)).toBe(true);
      expect(await isVerifiedOwner(ctx, ids.ownerA, placeB)).toBe(false);
      expect(await isVerifiedOwner(ctx, ids.creatorA, placeA)).toBe(false);
      expect(await placeHasOwner(ctx, placeA)).toBe(true);
      expect(await placeHasOwner(ctx, placeB)).toBe(false);
    });
  });

  it("loadReadablePlace gives not_found for a missing place and another creator's draft", async () => {
    const { b, as, ids, placeA } = await world();
    const missing = await addPlace(b, {
      createdBy: ids.creatorA,
      withNames: false,
      withPin: false,
    });
    await b.run((ctx) => ctx.db.delete("place", missing));
    expect(
      await errorCode(as("creatorA").run((ctx) => loadReadablePlace(ctx, null, missing))),
    ).toBe("not_found");
    expect(
      await errorCode(
        as("creatorB").run(async (ctx) => loadReadablePlace(ctx, await currentPerson(ctx), placeA)),
      ),
    ).toBe("not_found");
    expect(
      await errorCode(as("signedOut").run((ctx) => loadReadablePlace(ctx, null, placeA))),
    ).toBe("not_found");
  });

  it("loadReadablePlace returns a demo place to a signed-out viewer", async () => {
    const { b, demo } = await world();
    expect(await b.t.run((ctx) => loadReadablePlace(ctx, null, demo))).toMatchObject({ _id: demo });
  });

  it("requireEditablePlace authenticates, hides unreadable drafts, then checks editing", async () => {
    const { as, ids, placeA, demo } = await world();
    for (const [viewer, code] of [
      ["signedOut", "unauthenticated"],
      ["ghost", "unauthenticated"],
      ["creatorB", "not_found"],
      ["user", "not_found"],
      ["ownerA", "forbidden"],
    ] as const) {
      expect(
        await errorCode(as(viewer).run((ctx) => requireEditablePlace(ctx, placeA))),
        viewer,
      ).toBe(code);
    }
    expect(await as("creatorA").run((ctx) => requireEditablePlace(ctx, placeA))).toMatchObject({
      person: { _id: ids.creatorA },
      place: { _id: placeA },
    });
    expect(await as("steward").run((ctx) => requireEditablePlace(ctx, placeA))).toMatchObject({
      person: { _id: ids.steward },
    });
    expect(await errorCode(as("user").run((ctx) => requireEditablePlace(ctx, demo)))).toBe(
      "forbidden",
    );
  });
});

describe("source and claim policy", () => {
  it("keeps consented pilot sources readable to signed-in visitors", async () => {
    const { b, as, ids, placeA, placeDoc } = await world();
    await b.run((ctx) => ctx.db.patch("place", placeA, { visibility: "pilot" }));
    const sourceId = await addSource(b, {
      placeId: placeA,
      addedBy: ids.creatorA,
      demoConsentBy: ids.steward,
    });
    const source = await b.t.run((ctx) => ctx.db.get("source", sourceId));
    if (source === null) throw new Error("fixture source is missing");
    const place = await placeDoc(placeA);
    expect(
      await as("user").run(async (ctx) =>
        canSeeSource(ctx, await currentPerson(ctx), place, source),
      ),
    ).toBe(true);
  });

  for (const isMock of [false, true]) {
    for (const consent of [false, true]) {
      for (const status of ["live", "gone", "hidden"] as const) {
        it(`canSeeSource: ${status}, consent=${consent}, mock=${isMock}`, async () => {
          const { b, as, ids, demo, placeDoc } = await world();
          const sourceId = await addSource(b, {
            placeId: demo,
            addedBy: ids.creatorB,
            status,
            isMock,
            demoConsentBy: consent ? ids.steward : undefined,
          });
          const source = await b.t.run((ctx) => ctx.db.get("source", sourceId));
          if (source === null) throw new Error("fixture source is missing");
          // A consent recorded at epoch zero is still consent, not a falsy absence.
          if (consent) source.demoConsentAt = 0;
          const place = await placeDoc(demo);
          for (const viewer of VIEWERS) {
            const allowed =
              status === "live" &&
              (consent || ["creatorB", "mockCreator", "steward"].includes(viewer));
            expect(
              await as(viewer).run(async (ctx) =>
                canSeeSource(ctx, await currentPerson(ctx), place, source),
              ),
              viewer,
            ).toBe(allowed);
          }
        });
      }
    }
  }

  it("canSeeSource admits the verified owner and rejects a source from another place", async () => {
    const { b, as, ids, placeA, demo, placeDoc } = await world();
    const sourceId = await addSource(b, { placeId: placeA, addedBy: ids.creatorB });
    const source = await b.t.run((ctx) => ctx.db.get("source", sourceId));
    if (source === null) throw new Error("fixture source is missing");
    const place = await placeDoc(placeA);
    expect(
      await as("ownerA").run(async (ctx) =>
        canSeeSource(ctx, await currentPerson(ctx), place, source),
      ),
    ).toBe(true);
    const other = await placeDoc(demo);
    expect(
      await as("steward").run(async (ctx) =>
        canSeeSource(ctx, await currentPerson(ctx), other, source),
      ),
    ).toBe(false);
  });

  it("isPublicSafeClaim rejects a mock claim on a real place", () => {
    for (const origin of ["interview", "open_text", "creator_note"] as const) {
      for (const isMock of [false, true]) {
        for (const placeIsMock of [false, true]) {
          expect(isPublicSafeClaim({ origin, isMock }, { isMock: placeIsMock })).toBe(
            origin === "open_text" || isMock === placeIsMock,
          );
        }
      }
    }
  });
});

describe("interview policy", () => {
  it("requireInterviewer admits the interviewer and steward and hides unreadable places", async () => {
    const { as, ids, interviewId, placeA } = await world();
    for (const viewer of VIEWERS) {
      const result = as(viewer).run((ctx) => requireInterviewer(ctx, interviewId));
      if (viewer === "creatorA" || viewer === "steward") {
        expect(await result, viewer).toMatchObject({
          person: { _id: ids[viewer] },
          interview: { _id: interviewId },
          place: { _id: placeA },
        });
      } else {
        expect(await errorCode(result), viewer).toBe(
          viewer === "signedOut"
            ? "unauthenticated"
            : viewer === "ownerA"
              ? "forbidden"
              : "not_found",
        );
      }
    }
  });

  it("requireInterviewReader also admits the verified owner", async () => {
    const { as, ids, interviewId, placeA } = await world();
    for (const viewer of VIEWERS) {
      const result = as(viewer).run((ctx) => requireInterviewReader(ctx, interviewId));
      if (viewer === "creatorA" || viewer === "steward" || viewer === "ownerA") {
        expect(await result, viewer).toMatchObject({
          person: { _id: ids[viewer] },
          interview: { _id: interviewId },
          place: { _id: placeA },
        });
      } else {
        expect(await errorCode(result), viewer).toBe(
          viewer === "signedOut" ? "unauthenticated" : "not_found",
        );
      }
    }
  });

  it("both interview guards give not_found for a missing interview", async () => {
    const { b, as, interviewId } = await world();
    await b.run((ctx) => ctx.db.delete("interview", interviewId));
    for (const guard of [requireInterviewer, requireInterviewReader]) {
      expect(await errorCode(as("creatorA").run((ctx) => guard(ctx, interviewId)))).toBe(
        "not_found",
      );
    }
  });

  it("an interview on a draft is not_found for a creator who cannot read the place, forbidden for one who can but is not the interviewer", async () => {
    const { b, as, ids, placeA, placeB, interviewId } = await world();
    const otherInterview = await addInterview(b, {
      placeId: placeA,
      interviewerId: ids.creatorB,
    });
    const inaccessibleInterview = await addInterview(b, {
      placeId: placeB,
      interviewerId: ids.creatorA,
    });
    for (const guard of [requireInterviewer, requireInterviewReader]) {
      expect(await errorCode(as("creatorB").run((ctx) => guard(ctx, interviewId)))).toBe(
        "not_found",
      );
      expect(await errorCode(as("creatorA").run((ctx) => guard(ctx, otherInterview)))).toBe(
        "forbidden",
      );
      expect(await errorCode(as("creatorA").run((ctx) => guard(ctx, inaccessibleInterview)))).toBe(
        "not_found",
      );
    }
  });

  it("an interviewer demoted to user can no longer work on or read the interview", async () => {
    const { b, as, ids, interviewId } = await world();
    await b.run((ctx) => ctx.db.patch("person", ids.creatorA, { role: "user" }));
    for (const guard of [requireInterviewer, requireInterviewReader]) {
      expect(await errorCode(as("creatorA").run((ctx) => guard(ctx, interviewId)))).toBe(
        "forbidden",
      );
    }
  });

  it("an interview's ownerPersonId alone does not grant reader access", async () => {
    const { b, as, ids, placeB } = await world();
    const interviewId = await addInterview(b, {
      placeId: placeB,
      interviewerId: ids.creatorB,
      ownerPersonId: ids.ownerA,
    });
    expect(
      await errorCode(as("ownerA").run((ctx) => requireInterviewReader(ctx, interviewId))),
    ).toBe("not_found");
  });
});

describe("shared fixtures", () => {
  it("addClaim refuses a one-sided dispute", async () => {
    const { b, placeA } = await world();
    const partner = await addClaim(b, { placeId: placeA, status: "published" });
    await expect(
      addClaim(b, { placeId: placeA, status: "disputed", disputedWith: partner }),
    ).rejects.toThrow("addClaim refuses a one-sided dispute");
    expect(await b.run((ctx) => ctx.db.query("claim").take(10))).toHaveLength(1);
    expect(await b.run((ctx) => ctx.db.get("claim", partner))).toMatchObject({
      status: "published",
    });
  });

  it("addDisputePair creates reciprocal links for claims of one place", async () => {
    const { b, placeA, placeB } = await world();
    const { first, second } = await addDisputePair(b, { placeId: placeA }, { placeId: placeA });
    expect(await b.run((ctx) => ctx.db.get("claim", first))).toMatchObject({
      status: "disputed",
      disputedWith: second,
    });
    expect(await b.run((ctx) => ctx.db.get("claim", second))).toMatchObject({
      status: "disputed",
      disputedWith: first,
    });
    await expect(addDisputePair(b, { placeId: placeA }, { placeId: placeB })).rejects.toThrow(
      "same place",
    );
    expect(await b.run((ctx) => ctx.db.query("claim").take(10))).toHaveLength(2);
  });

  it("addOwner grants the person the business_owner role", async () => {
    const { b, ids, placeA } = await world();
    await addOwner(b, placeA, ids.user, ids.steward);
    expect(await b.run((ctx) => ctx.db.get("person", ids.user))).toMatchObject({
      role: "business_owner",
    });
  });
  it("fixtures satisfy the rules with defaults, published claims and cited sentences", async () => {
    const b = newBackend(modules);
    const creator = await addPerson(b, "test-creator", "creator");
    const owner = await addPerson(b, "test-owner", "business_owner");
    const steward = await addPerson(b, "test-steward", "steward");
    const placeId = await addPlace(b, { createdBy: creator });
    const unownedPlace = await addPlace(b, { createdBy: creator });
    const ownerId = await addOwner(b, placeId, owner, steward);
    const sourceId = await addSource(b, { placeId, addedBy: creator });
    const interviewId = await addInterview(b, { placeId, interviewerId: creator });
    const { transcriptId, text } = await addCorrectedTranscript(b, {
      interviewId,
      createdBy: creator,
    });
    const proposedId = await addClaim(b, { placeId });
    const interviewClaimId = await addClaim(b, {
      placeId,
      origin: "interview",
      transcriptId,
      status: "published",
    });
    const openClaimId = await addClaim(b, {
      placeId: unownedPlace,
      origin: "open_text",
      status: "published",
    });
    const pageId = await addPage(b, {
      placeId,
      sentences: [{ lang: "ja", text, claimIds: [interviewClaimId] }],
    });
    await b.t.run(async (ctx) => {
      expect(await ctx.db.get("person", creator)).toMatchObject({
        tokenIdentifier: `${ISSUER}|test-creator`,
        clerkUserId: "test-creator",
        isMock: false,
      });
      expect(await ctx.db.get("place", placeId)).toMatchObject({
        visibility: "draft",
        regionId: "nagasaki",
        isMock: false,
      });
      expect((await ctx.db.get("place", placeId))?.kind).toBeUndefined();
      expect(await ctx.db.get("placeOwner", ownerId)).toMatchObject({ personId: owner });
      const names = await ctx.db
        .query("placeName")
        .withIndex("by_placeId_and_lang", (q) => q.eq("placeId", placeId))
        .take(10);
      expect(names).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lang: "ja",
            script: "kanji",
            value: "テスト店",
            isPrimary: true,
          }),
          expect.objectContaining({
            lang: "en",
            script: "latin",
            value: "Test Shop",
            isPrimary: true,
          }),
        ]),
      );
      expect(names).toHaveLength(2);
      const pin = await ctx.db
        .query("pin")
        .withIndex("by_placeId", (q) => q.eq("placeId", placeId))
        .unique();
      expect(pin).toMatchObject({
        lat: nagasaki.defaultCenter.lat,
        lng: nagasaki.defaultCenter.lng,
      });
      expect(await ctx.db.get("source", sourceId)).toMatchObject({
        adapter: "link_card",
        status: "live",
        url: expect.stringMatching(/^https:\/\/example\.com\/post-/),
      });
      expect(await ctx.db.get("interview", interviewId)).toMatchObject({
        status: "consent_pending",
        language: "ja",
      });
      expect(
        await ctx.db
          .query("consent")
          .withIndex("by_interviewId", (q) => q.eq("interviewId", interviewId))
          .unique(),
      ).not.toBeNull();
      expect(await ctx.db.get("transcript", transcriptId)).toMatchObject({
        origin: "human_corrected",
        version: 1,
      });
      expect(text).toBe("これはテスト用の文字起こしです。");
      expect(await ctx.db.get("claim", proposedId)).toMatchObject({ status: "proposed" });
      expect(await ctx.db.get("claim", interviewClaimId)).toMatchObject({
        status: "published",
        confirmedAt: expect.any(Number),
        spanStart: 0,
        spanEnd: text.length,
        quote: text,
      });
      const openClaim = await ctx.db.get("claim", openClaimId);
      expect(openClaim).toMatchObject({ status: "published", reviewerId: steward, isMock: false });
      if (!openClaim?.sourceOpenTextId) throw new Error("fixture snippet is missing");
      expect(await ctx.db.get("openTextSnippet", openClaim.sourceOpenTextId)).toMatchObject({
        placeId: unownedPlace,
        licence: "CC-BY-SA-4.0",
        approvedBy: steward,
      });
      expect(await ctx.db.get("pageVersion", pageId)).toMatchObject({
        version: 1,
        status: "published",
      });
      expect(
        await ctx.db
          .query("pageSentence")
          .withIndex("by_pageVersionId_and_lang_and_ordinal", (q) => q.eq("pageVersionId", pageId))
          .take(10),
      ).toMatchObject([{ held: false, claimIds: [interviewClaimId] }]);
    });
  });

  it("versions transcripts monotonically and joins segments with a newline", async () => {
    const { b, ids, interviewId } = await world();
    await addCorrectedTranscript(b, { interviewId, createdBy: ids.creatorA });
    const result = await addCorrectedTranscript(b, {
      interviewId,
      createdBy: ids.creatorA,
      segments: [
        { start: 0, end: 1, text: "テストです。" },
        { start: 1, end: 2, text: "架空の内容です。" },
      ],
    });
    expect(result.text).toBe("テストです。\n架空の内容です。");
    expect(await b.t.run((ctx) => ctx.db.get("transcript", result.transcriptId))).toMatchObject({
      version: 2,
    });
  });

  it("propagates mock provenance from the person to their fixture records", async () => {
    const { b, ids } = await world();
    const placeId = await addPlace(b, { createdBy: ids.mockCreator });
    const sourceId = await addSource(b, { placeId, addedBy: ids.mockCreator });
    const interviewId = await addInterview(b, { placeId, interviewerId: ids.mockCreator });
    const { transcriptId } = await addCorrectedTranscript(b, {
      interviewId,
      createdBy: ids.mockCreator,
    });
    const claimId = await addClaim(b, { placeId, origin: "interview", transcriptId });
    await b.t.run(async (ctx) => {
      expect((await ctx.db.get("place", placeId))?.isMock).toBe(true);
      expect((await ctx.db.get("source", sourceId))?.isMock).toBe(true);
      expect((await ctx.db.get("interview", interviewId))?.isMock).toBe(true);
      expect((await ctx.db.get("claim", claimId))?.isMock).toBe(true);
    });
  });

  it("the fixture gate rejects invalid sources, interviews and page sentences", async () => {
    const { b, ids, placeA } = await world();
    const options = {
      placeId: placeA,
      addedBy: ids.creatorA,
      url: "https://example.com/duplicate",
    };
    await addSource(b, options);
    expect(await ruleOf(addSource(b, options))).toBe("source_place_url_unique");
    expect(
      await ruleOf(
        addInterview(b, {
          placeId: placeA,
          interviewerId: ids.creatorA,
          consent: false,
          status: "uploaded",
        }),
      ),
    ).toBe("interview_requires_consent");
    expect(
      await ruleOf(
        addPage(b, {
          placeId: placeA,
          sentences: [{ lang: "ja", text: "テストです。", claimIds: [] }],
        }),
      ),
    ).toBe("sentence_needs_claim");
    const interviewId = await addInterview(b, {
      placeId: placeA,
      interviewerId: ids.creatorA,
      status: "uploaded",
    });
    expect(await b.t.run((ctx) => ctx.db.get("interview", interviewId))).toMatchObject({
      status: "uploaded",
    });
  });

  it("error helpers describe successful work, app errors and unstructured errors", async () => {
    for (const helper of [errorCode, ruleOf]) {
      expect(await helper(Promise.resolve(null))).toBe("did not fail");
      expect(await helper(Promise.reject(appError("forbidden", "test")))).toBe("forbidden");
      expect(await helper(Promise.reject(new Error("test failure")))).toBe(
        "threw without a code: Error: test failure",
      );
    }
  });
});
