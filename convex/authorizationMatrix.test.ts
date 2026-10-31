/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import {
  addClaim,
  addCorrectedTranscript,
  addInterview,
  addOwner,
  addPerson,
  addPlace,
  addSource,
  errorCode as fixtureErrorCode,
  newBackend,
} from "../tests/convex/fixtures";
import nagasaki from "../regions/nagasaki.json";
import { api } from "./_generated/api";
import type { ErrorCode } from "./lib/errors";

const modules = import.meta.glob("./**/*.ts");
const callers = [
  "signedOut",
  "user",
  "creatorA",
  "creatorB",
  "ownerP",
  "ownerQ",
  "demotedOwner",
  "steward",
] as const;
type CallerName = (typeof callers)[number];
const names = [{ lang: "en", script: "latin" as const, value: "Fictional Matrix Cafe" }];
const input = {
  regionId: "nagasaki",
  kind: "business" as const,
  names,
  pin: { lat: nagasaki.defaultCenter.lat, lng: nagasaki.defaultCenter.lng },
};

async function world() {
  const b = newBackend(modules);
  const user = await addPerson(b, "user", "user");
  const creatorA = await addPerson(b, "creatorA", "creator");
  await addPerson(b, "creatorB", "creator");
  const ownerP = await addPerson(b, "ownerP", "business_owner");
  const ownerQ = await addPerson(b, "ownerQ", "business_owner");
  const demotedOwner = await addPerson(b, "demotedOwner", "user");
  const steward = await addPerson(b, "steward", "steward");
  await addPerson(b, "mockCreator", "creator", { isMock: true });
  const { placeId: P } = await b.as("creatorA").mutation(api.places.create, input);
  const Q = await addPlace(b, { createdBy: steward });
  await addOwner(b, P, ownerP, steward);
  await addOwner(b, Q, ownerQ, steward);
  await addOwner(b, P, demotedOwner, steward);
  await b.run((ctx) => ctx.db.patch("person", demotedOwner, { role: "user" }));
  const { placeId: M } = await b.as("mockCreator").mutation(api.places.create, input);
  const { placeId: L } = await b
    .as("steward")
    .mutation(api.places.create, { ...input, kind: "landmark" });
  const source = await addSource(b, { placeId: P, addedBy: creatorA, demoConsentBy: steward });
  const story = await b.run((ctx) =>
    ctx.db.insert("story", {
      placeId: P,
      authorPersonId: creatorA,
      body: "架空の話。",
      lang: "ja",
      status: "live",
      isMock: false,
    }),
  );
  const interview = await addInterview(b, { placeId: P, interviewerId: creatorA });
  const { transcriptId, text } = await addCorrectedTranscript(b, {
    interviewId: interview,
    createdBy: creatorA,
  });
  const proposed = await addClaim(b, { placeId: P, origin: "interview", transcriptId });
  const confirmed = await addClaim(b, {
    placeId: P,
    origin: "interview",
    transcriptId,
    status: "owner_confirmed",
    reviewerId: ownerP,
  });
  const openClaim = await addClaim(b, { placeId: P, origin: "open_text" });
  const snippet = await b.run((ctx) =>
    ctx.db.insert("openTextSnippet", {
      lang: "ja",
      text: "架空の公開テキスト。",
      licence: "CC0",
      sourceUrl: "https://example.com/matrix-open",
      attribution: "Fictional test author",
      retrievedAt: 1,
    }),
  );
  return {
    b,
    user,
    ownerP,
    ownerQ,
    P,
    Q,
    M,
    L,
    source,
    story,
    interview,
    transcriptId,
    text,
    proposed,
    confirmed,
    openClaim,
    snippet,
  };
}
type World = Awaited<ReturnType<typeof world>>;
type AsCaller = ReturnType<World["b"]["as"]>;
type Row = {
  fn: string;
  call: (asCaller: AsCaller, w: World) => Promise<unknown>;
  allowed: CallerName[];
  denied?: Partial<Record<CallerName, ErrorCode>>;
};
const editors: CallerName[] = ["creatorA", "steward"];
const members = callers.filter((caller) => caller !== "signedOut");
const unreadable = {
  user: "not_found",
  creatorB: "not_found",
  ownerQ: "not_found",
  demotedOwner: "not_found",
} as const;
const creatorGuard = { creatorB: "not_found" } as const;
const rows: Record<string, Row[]> = {
  places: [
    {
      // Any signed-in member may add a missing place, and put it on the map (FR-032).
      fn: "places.create business",
      call: (as) => as.mutation(api.places.create, input),
      allowed: members,
    },
    {
      fn: "places.create on the map",
      call: (as) => as.mutation(api.places.create, { ...input, category: "cafe", onMap: true }),
      // A member who has been there puts it on the map, before launch too (FR-032).
      allowed: members,
    },
    {
      fn: "places.create landmark",
      call: (as) => as.mutation(api.places.create, { ...input, kind: "landmark" }),
      allowed: ["steward"],
    },
    {
      fn: "places.updateNames",
      call: (as, w) => as.mutation(api.places.updateNames, { placeId: w.P, names }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "places.movePin",
      call: (as, w) => as.mutation(api.places.movePin, { placeId: w.P, ...input.pin }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "places.setCategory",
      call: (as, w) => as.mutation(api.places.setCategory, { placeId: w.P, category: "cafe" }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "places.setKind",
      call: (as, w) => as.mutation(api.places.setKind, { placeId: w.P, kind: "landmark" }),
      allowed: ["steward"],
    },
    ...(["P", "M", "L"] as const).map((place): Row => ({
      fn: `places.setVisibility ${place} without confirmFictional`,
      call: (as, w) =>
        as.mutation(api.places.setVisibility, { placeId: w[place], visibility: "demo_public" }),
      allowed: [],
      denied: { steward: "conflict" },
    })),
    {
      fn: "places.setVisibility M with confirmFictional",
      call: (as, w) =>
        as.mutation(api.places.setVisibility, {
          placeId: w.M,
          visibility: "demo_public",
          confirmFictional: true,
        }),
      allowed: ["steward"],
    },
    {
      fn: "places.attachOwner",
      call: (as, w) => as.mutation(api.places.attachOwner, { placeId: w.L, personId: w.ownerQ }),
      allowed: ["steward"],
    },
  ],
  sources: [
    {
      fn: "sources.add",
      call: (as, w) =>
        as.mutation(api.sources.add, {
          placeId: w.P,
          url: "https://example.com/matrix-new",
          title: "Fictional test link",
        }),
      // Any member who can read the place may link a post (FR-032); P is a draft.
      allowed: ["creatorA", "ownerP", "steward"],
      denied: unreadable,
    },
    {
      fn: "sources.remove",
      call: (as, w) => as.mutation(api.sources.remove, { sourceId: w.source }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "stories.add",
      call: (as, w) =>
        as.mutation(api.stories.add, { placeId: w.P, body: "架空の話。", lang: "ja" }),
      // Any member who can read the place may write a story (FR-033); P is a draft.
      allowed: ["creatorA", "ownerP", "steward"],
      denied: unreadable,
    },
    {
      fn: "stories.listForPlace",
      call: (as, w) => as.query(api.stories.listForPlace, { placeId: w.P }),
      // Anyone may ask; a place they cannot read has no stories for them.
      allowed: [...callers],
    },
    {
      fn: "stories.latest",
      call: (as) => as.query(api.stories.latest, { regionId: "nagasaki" }),
      // The home page's newest stories: only what everyone may read, the same for every caller.
      allowed: [...callers],
    },
    {
      fn: "stories.remove",
      call: (as, w) => as.mutation(api.stories.remove, { storyId: w.story }),
      allowed: editors,
      denied: unreadable,
    },
    ...(["markGone", "recordDemoConsent", "revokeDemoConsent"] as const).map((fn): Row => ({
      fn: `sources.${fn}`,
      call: async (as, w) => {
        if (fn === "recordDemoConsent") {
          await w.b.run((ctx) =>
            ctx.db.patch("source", w.source, {
              demoConsentAt: undefined,
              demoConsentBy: undefined,
            }),
          );
        }
        return as.mutation(api.sources[fn], { sourceId: w.source });
      },
      allowed: ["steward"],
    })),
  ],
  interviews: [
    {
      fn: "interviews.create",
      call: (as, w) => as.mutation(api.interviews.create, { placeId: w.P, language: "ja" }),
      allowed: editors,
      denied: creatorGuard,
    },
    {
      fn: "interviews.recordConsent",
      call: async (as, w) => {
        const interviewId = await addInterview(w.b, {
          placeId: w.P,
          interviewerId: await w.b.run(async (ctx) => (await ctx.db.get("place", w.P))!.createdBy),
          consent: false,
        });
        return as.mutation(api.interviews.recordConsent, {
          interviewId,
          scope: { publish: true, aiProcessing: true, transferAbroad: true, voiceRetention: true },
          textVersion: nagasaki.consent.textVersion,
          textLang: "ja",
          assisted: false,
        });
      },
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "interviews.saveCorrection",
      call: (as, w) =>
        as.mutation(api.interviews.saveCorrection, {
          interviewId: w.interview,
          segments: [{ start: 0, end: 2, text: "架空の訂正文。" }],
        }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "interviews.withdraw",
      call: (as, w) => as.mutation(api.interviews.withdraw, { interviewId: w.interview }),
      allowed: ["ownerP", "steward"],
    },
    {
      fn: "interviews.get",
      call: (as, w) => as.query(api.interviews.get, { interviewId: w.interview }),
      allowed: ["creatorA", "ownerP", "steward"],
      denied: unreadable,
    },
  ],
  audio: [
    {
      fn: "audio.generateUploadUrl",
      call: (as, w) => as.mutation(api.audio.generateUploadUrl, { interviewId: w.interview }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "audio.attach",
      call: async (as, w) => {
        const storageId = await w.b.t.run((ctx) =>
          ctx.storage.store(new Blob(["not audio"], { type: "text/plain" })),
        );
        try {
          const result = await as.mutation(api.audio.attach, {
            interviewId: w.interview,
            storageId,
          });
          expect(result).toMatchObject({ ok: false, code: "invalid_input" });
          expect(await w.b.t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
        } catch (error) {
          expect(await w.b.t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
          throw error;
        }
      },
      allowed: editors,
      denied: unreadable,
    },
  ],
  claims: [
    ...(["confirm", "edit", "remove"] as const).map((action): Row => ({
      fn: `claims.review ${action}`,
      call: (as, w) =>
        as.mutation(api.claims.review, {
          claimId: w.proposed,
          action,
          ...(action === "edit" ? { text: "架空の修正文。" } : {}),
        }),
      allowed: ["ownerP"],
    })),
    {
      fn: "claims.review open text",
      call: (as, w) => as.mutation(api.claims.review, { claimId: w.openClaim, action: "confirm" }),
      allowed: [],
      denied: { ownerP: "conflict" },
    },
    {
      fn: "claims.proposeFromSpan",
      call: (as, w) =>
        as.mutation(api.claims.proposeFromSpan, {
          transcriptId: w.transcriptId,
          spanStart: 0,
          spanEnd: w.text.length,
          textOriginal: w.text,
          kind: "story",
        }),
      allowed: editors,
      denied: unreadable,
    },
    {
      fn: "claims.setHumanTranslation",
      call: (as, w) =>
        as.mutation(api.claims.setHumanTranslation, {
          claimId: w.confirmed,
          lang: "en",
          text: "Fictional translation.",
        }),
      allowed: ["steward"],
    },
    {
      fn: "claims.markDisputed",
      call: async (as, w) => {
        const a = await addClaim(w.b, { placeId: w.P, status: "published", reviewerId: w.ownerP });
        const b = await addClaim(w.b, { placeId: w.P, status: "published", reviewerId: w.ownerP });
        return as.mutation(api.claims.markDisputed, { claimIdA: a, claimIdB: b });
      },
      allowed: ["steward"],
    },
    {
      fn: "claims.listForPlace",
      call: (as, w) => as.query(api.claims.listForPlace, { placeId: w.P }),
      allowed: ["creatorA", "ownerP", "steward"],
      denied: { ...unreadable, signedOut: "not_found" },
    },
  ],
  pages: [
    {
      fn: "pages.compose",
      call: (as, w) => as.mutation(api.pages.compose, { placeId: w.P }),
      allowed: ["steward"],
    },
    {
      fn: "pages.getPublished draft",
      call: async (as, w) => {
        await w.b.as("steward").mutation(api.pages.compose, { placeId: w.P });
        const result = await as.query(api.pages.getPublished, { placeId: w.P });
        if (result !== null) expect(result.sentences.length).toBeGreaterThan(0);
        return result;
      },
      allowed: [...callers],
    },
  ],
  openText: [
    {
      fn: "openText.link",
      call: (as, w) => as.mutation(api.openText.link, { snippetId: w.snippet, placeId: w.L }),
      allowed: ["steward"],
    },
    {
      fn: "openText.link owned place",
      call: (as, w) => as.mutation(api.openText.link, { snippetId: w.snippet, placeId: w.P }),
      allowed: [],
      denied: { steward: "conflict" },
    },
    {
      fn: "openText.approveExcerpts",
      call: async (as, w) => {
        await w.b.as("steward").mutation(api.openText.link, { snippetId: w.snippet, placeId: w.L });
        return as.mutation(api.openText.approveExcerpts, {
          snippetId: w.snippet,
          excerpts: [{ start: 0, end: 3, kind: "story" }],
        });
      },
      allowed: ["steward"],
    },
  ],
  people: [
    {
      fn: "people.setRole",
      call: (as, w) => as.mutation(api.people.setRole, { personId: w.user, role: "creator" }),
      allowed: ["steward"],
    },
    {
      fn: "people.setRole steward",
      call: async (as, w) => {
        const personId = await w.b.run(
          async (ctx) =>
            (await ctx.db
              .query("person")
              .withIndex("by_role", (q) => q.eq("role", "steward"))
              .first())!._id,
        );
        return as.mutation(api.people.setRole, { personId, role: "user" });
      },
      allowed: [],
      denied: { steward: "conflict" },
    },
    { fn: "people.current", call: (as) => as.query(api.people.current, {}), allowed: [...callers] },
  ],
};

async function errorCode(work: Promise<unknown>) {
  const code = await fixtureErrorCode(work);
  return code === "did not fail" ? "ok" : code;
}
for (const [module, tests] of Object.entries(rows)) {
  describe(module, () => {
    for (const row of tests) {
      it(`${row.fn}: ${row.allowed.join(", ") || "no callers"} may, others get ${JSON.stringify(row.denied ?? "forbidden/unauthenticated")}`, async () => {
        for (const caller of callers) {
          const w = await world();
          const as = caller === "signedOut" ? w.b.t : w.b.as(caller);
          const work = row.call(as, w);
          if (row.fn === "people.current" && caller === "signedOut") expect(await work).toBeNull();
          if (row.fn === "pages.getPublished draft") {
            const result = await work;
            if (["signedOut", "user", "creatorB", "ownerQ", "demotedOwner"].includes(caller))
              expect(result, caller).toBeNull();
            else expect(result, caller).not.toBeNull();
          }
          expect(await errorCode(work), `${row.fn} as ${caller}`).toBe(
            row.allowed.includes(caller)
              ? "ok"
              : (row.denied?.[caller] ??
                  (caller === "signedOut" ? "unauthenticated" : "forbidden")),
          );
        }
      });
    }
  });
}
