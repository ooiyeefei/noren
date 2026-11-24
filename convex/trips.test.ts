/// <reference types="vite/client" />
import { anyApi, type ApiFromModules } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as modelFactory from "../src/lib/ai/claim-extractor";
import { scriptedModel } from "../tests/fixtures/planner";
import { isoWeekKey, previousWeekKey } from "../src/lib/draw/time";
import { cellOf } from "../src/lib/geo/geohash";
import { getRegionConfig } from "../src/lib/region/registry";
import * as engine from "../src/lib/trip";
import { TRIP_CONSENT_VERSION } from "../src/lib/trip/consent";
import { fillGuesses } from "../src/lib/trip/request";
import type { Plan, TripRequest } from "../src/lib/trip/types";
import {
  addClaim,
  addPerson,
  addPlace,
  addSource,
  newBackend,
  type Backend,
} from "../tests/convex/fixtures";
import type { Doc } from "./_generated/dataModel";
import * as region from "./lib/region";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const functions = anyApi as unknown as ApiFromModules<{
  trips: typeof import("./trips");
  tripActions: typeof import("./tripActions");
  people: typeof import("./people");
}>;
const actions = functions.tripActions;
const now = Date.UTC(2026, 10, 22, 17); // Monday in both regions.
const tripRegion = getRegionConfig("malaysia-west")!;
const near = tripRegion.towns![0]!.center;
const anchor = { near, withinMetres: 100 };

function request(): TripRequest {
  return {
    regionId: tripRegion.id,
    start: "ipoh",
    end: "ipoh",
    days: 1,
    pins: [],
    party: fillGuesses(
      {
        travellers: [{ key: "t1", ageBand: "older", rules: ["step-free"], likes: [], skips: [] }],
      },
      tripRegion,
    ),
  };
}

async function setup(
  mode: ReturnType<typeof region.tripSwitch> = "open",
  options?: Parameters<typeof newBackend>[1],
) {
  vi.spyOn(region, "tripSwitch").mockReturnValue(mode);
  const b = newBackend(modules, options);
  const member = await addPerson(b, "member", "user");
  const trial = await addPerson(b, "trial", "user");
  await b.t.mutation(functions.people.setTrial, { clerkUserId: "trial", trial: "trip", on: true });
  return { ...b, member, trial };
}

const refusal = (code: string) => ({ data: { code } });
const plannedStops = (plan: Plan) =>
  plan.days.flatMap(({ index: day, items }) =>
    items.flatMap((item) => (item.kind === "stop" ? [{ ...item, day }] : [])),
  );
const townPin = (id: string) => tripRegion.towns!.find((town) => town.id === id)!.center;

async function tableRows(b: Backend) {
  return b.t.run(async (ctx) =>
    Object.fromEntries(
      await Promise.all(
        (Object.keys(schema.tables) as (keyof typeof schema.tables)[]).map(async (table) => [
          table,
          await ctx.db.query(table).take(100),
        ]),
      ),
    ),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("trip access and planning", () => {
  it("requires current consent for planning and interpretation and keeps the first acceptance time", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const model = mockTripModel();
    const caller = b.as("member");
    const version = TRIP_CONSENT_VERSION;
    const consent = () => b.t.run(async (ctx) => {
      const person = await ctx.db.get("person", b.member);
      return person?.tripConsent ?? null;
    });

    const { messages, outline, language } = interpretation;
    for (const consentVersion of [undefined, "older-wording"]) {
      const args = consentVersion === undefined ? {} : { consentVersion };
      await expect(caller.action(actions.plan, { request: request(), ...args })).rejects.toMatchObject(
        refusal("invalid_input"),
      );
      await expect(caller.action(actions.interpret, { messages, outline, language, ...args })).rejects.toMatchObject(
        refusal("invalid_input"),
      );
    }
    expect(await consent()).toBeNull();
    expect(model).not.toHaveBeenCalled();
    expect(await b.t.run((ctx) => ctx.db.query("rateLimit").take(10))).toEqual([]);

    await caller.action(actions.plan, { request: request(), consentVersion: version });
    const first = await consent();
    expect(first).toEqual({ version, at: expect.any(Number) });

    // Advance past the saved timestamp so an accidental rewrite would be visible.
    await vi.waitUntil(() => Date.now() > first!.at, { interval: 1 });
    await caller.action(actions.interpret, { ...interpretation, consentVersion: version });
    expect(await consent()).toEqual(first);

    await b.t.run((ctx) => ctx.db.patch("person", b.member, {
      tripConsent: { version: "older-wording", at: first!.at },
    }));
    await caller.action(actions.interpret, { ...interpretation, consentVersion: version });
    const updated = await consent();
    expect(updated?.version).toBe(version);
    expect(updated?.at).toBeGreaterThan(first!.at);
  });

  it.each(["off", "trial"] as const)(
    "hides %s trips from everyone outside the trial",
    async (mode) => {
      const b = await setup(mode);
      const refused = [b.t, b.as("ghost"), b.as("member")];
      if (mode === "off") refused.push(b.as("trial"));
      for (const caller of refused) {
        await expect(caller.action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: null })).rejects.toMatchObject(
          refusal("not_found"),
        );
      }
      expect(await b.t.run((ctx) => ctx.db.query("rateLimit").take(10))).toEqual([]);
      if (mode === "trial") {
        vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
        await expect(
          b.as("trial").action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: request() }),
        ).resolves.toMatchObject({ seed: expect.any(String) });
      }
    },
  );

  it("requires account sign-in when open", async () => {
    const b = await setup();
    await expect(b.t.action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: request() })).rejects.toMatchObject(
      refusal("unauthenticated"),
    );
  });

  it("validates request sizes without echoing party data", async () => {
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const b = await setup();
    const input = request();
    const bad = [
      { ...input, days: 8 },
      {
        ...input,
        pins: Array.from({ length: 13 }, (_, i) => ({
          id: String(i),
          day: 1,
          minutes: 5,
          pin: near,
        })),
      },
      { ...input, ops: Array.from({ length: 21 }, () => ({ op: "lighten", day: 1 })) },
      { ...input, party: { ...input.party, travellers: Array(9).fill(input.party.travellers[0]) } },
      { ...input, party: { ...input.party, label: "Private party label" } },
    ];
    for (const invalid of bad) {
      await expect(b.as("member").action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: invalid })).rejects.toMatchObject(
        {
          data: {
            code: "invalid_input",
            message: expect.not.stringContaining("Private party label"),
          },
        },
      );
    }
  });

  it("loads the engine anchors and returns current public stop details, writing only counters and consent", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const placeId = await addPlace(b, {
      createdBy: b.member,
      regionId: tripRegion.id,
      visibility: "public",
      slug: "test-trip-stop",
      withPin: false,
    });
    await b.t.run(async (ctx) => {
      await ctx.db.patch("place", placeId, {
        mapPin: near,
        mapCell: cellOf(near),
        confirmedAt: now,
      });
      await ctx.db.insert("placeExposure", { placeId, weekKey: isoWeekKey(now, 8), count: 2 });
    });
    const before = await tableRows(b);
    vi.spyOn(engine, "anchorsFor").mockReturnValue([anchor]);
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.spyOn(engine, "planTrip").mockImplementation((_request, world) => {
      expect(world.today).toBe("2026-11-23");
      expect(world.seed).toBe("repeatable");
      expect(world.candidates(near, 100)).toMatchObject([{ placeId, recentSuggestions: 2 }]);
      expect(world.candidates(near, 99)).toEqual([]);
      return {
        days: [
          {
            index: 1,
            calendar: [],
            notes: [],
            driveMinutes: 0,
            items: [
              {
                kind: "stop",
                slot: "1:turn",
                at: "10:00",
                minutes: 15,
                place: { placeId, slug: "test-trip-stop" },
                because: { kind: "wild" },
                checks: [],
                confirmed: true,
                hasStory: false,
              },
            ],
          },
        ],
        unmet: [],
      };
    });
    const result = await b
      .as("member")
      .action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: request(), seed: "repeatable" });
    expect(result.seed).toBe("repeatable");
    expect(result.stops).toMatchObject([
      {
        placeId,
        names: expect.arrayContaining([expect.objectContaining({ value: "Test Shop" })]),
        confirmed: true,
        pin: near,
      },
    ]);
    const after = await tableRows(b);
    expect(after.rateLimit).toHaveLength(2);
    expect({
      ...before,
      rateLimit: after.rateLimit,
      person: (before.person as Doc<"person">[]).map((person) =>
        person._id === b.member
          ? { ...person, tripConsent: { version: TRIP_CONSENT_VERSION, at: expect.any(Number) } }
          : person,
      ),
    }).toEqual(after);

    await b.t.run((ctx) => ctx.db.patch("place", placeId, { visibility: "draft" }));
    await expect(
      b.t.query(functions.trips.stopDetails, { placeIds: [placeId, "missing"] }),
    ).resolves.toEqual([null, null]);
  });

  it.each([
    ["minute", 30],
    ["day", 300],
  ] as const)("caps plans per %s and per person", async (window, limit) => {
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const b = await setup();
    await b.t.run((ctx) =>
      ctx.db.insert("rateLimit", {
        key: `trip:plan:${window}:${b.member}`,
        count: limit - 1,
        windowStart: Date.now(),
      }),
    );
    const input = { request: request(), consentVersion: TRIP_CONSENT_VERSION };
    await b.as("member").action(actions.plan, input);
    const counters = await b.t.run((ctx) => ctx.db.query("rateLimit").take(10));
    expect(counters).toContainEqual(
      expect.objectContaining({
        key: `trip:plan:${window}:${b.member}`,
        count: limit,
      }),
    );
    const change = { ...input, request: { ...input.request, ops: [{ op: "lighten", day: 1 }] } };
    await expect(b.as("member").action(actions.plan, change)).rejects.toMatchObject(
      refusal("rate_limited"),
    );
    expect(await b.t.run((ctx) => ctx.db.query("rateLimit").take(10))).toEqual(counters);
    await expect(b.as("trial").action(actions.plan, input)).resolves.toMatchObject({
      seed: expect.any(String),
    });
  });
});

describe("trips.stops", () => {
  it("checks access before taking up to 84 places", async () => {
    const b = await setup("trial");
    const placeIds = Array<string>(85).fill("missing");
    await expect(b.t.query(functions.trips.stops, { placeIds })).rejects.toMatchObject(
      refusal("not_found"),
    );
    await expect(b.as("trial").query(functions.trips.stops, { placeIds })).rejects.toMatchObject(
      refusal("invalid_input"),
    );
    await expect(
      b.as("trial").query(functions.trips.stops, { placeIds: placeIds.slice(1) }),
    ).resolves.toEqual(Array(84).fill(null));
  });

  it("draws current public quotes with credits, and resolves public check sources", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const placeId = await addPlace(b, {
      createdBy: b.member,
      regionId: tripRegion.id,
      visibility: "public",
    });
    const sourceId = await addSource(b, { placeId, addedBy: b.trial });
    const takenDown = await addSource(b, { placeId, addedBy: b.trial });
    const withdrawnWriter = await addPerson(b, "withdrawn", "user", { nameConfirmed: false });
    const day = "2026-11-23";
    const { live, factId, postFact } = await b.run(async (ctx) => {
      const story = {
        placeId,
        authorPersonId: b.member,
        body: "A member's words.",
        lang: "en",
        status: "live",
        isMock: false,
      } as const;
      const live = await ctx.db.insert("story", story);
      await ctx.db.insert("story", { ...story, body: "Hidden words.", status: "hidden" });
      await ctx.db.insert("story", {
        ...story,
        authorPersonId: withdrawnWriter,
        body: "Words without a confirmed name.",
      });
      const post = {
        origin: "story_finder",
        sharedAt: now,
        excerpt: "The entrance was level.",
        excerptLang: "en",
        authorHandle: "a-visitor",
      } as const;
      await ctx.db.patch("source", sourceId, post);
      await ctx.db.patch("source", takenDown, {
        ...post,
        excerpt: "Taken down.",
        status: "hidden",
      });
      const fact = {
        placeId,
        regionId: tripRegion.id,
        key: "level_entrance",
        value: "yes",
        day,
        isMock: false,
        status: "live",
      } as const;
      const factId = await ctx.db.insert("placeFact", {
        ...fact,
        basis: "member",
        personId: b.member,
      });
      const postFact = await ctx.db.insert("placeFact", {
        ...fact,
        basis: "post",
        sourceId,
        quote: post.excerpt,
      });
      return { live, factId, postFact };
    });
    const read = async () =>
      (await b.as("member").query(functions.trips.stops, { placeIds: [placeId] }))[0];
    const before = await read();
    expect(before?.quotes).toMatchObject([
      {
        kind: "story",
        storyId: live,
        text: "A member's words.",
        authorName: "Test Person (member)",
      },
      {
        kind: "post",
        text: "The entrance was level.",
        source: { _id: sourceId, authorHandle: "a-visitor" },
      },
    ]);
    expect(before?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factId,
          basis: "member",
          day,
          reporterName: "Test Person (member)",
        }),
        expect.objectContaining({
          factId: postFact,
          basis: "post",
          day,
          source: expect.objectContaining({
            _id: sourceId,
            url: expect.stringMatching(/^https:/),
          }),
          quote: "The entrance was level.",
        }),
      ]),
    );
    expect(await read()).toEqual(before);
    await b.run(async (ctx) => {
      await ctx.db.patch("person", b.member, { nameConfirmedAt: undefined });
      await ctx.db.patch("source", sourceId, { status: "hidden" });
    });
    expect(await read()).toMatchObject({ quotes: [], facts: [{ factId }] });
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "draft" }));
    expect(await read()).toBeNull();
  });
});

describe("trips.candidates", () => {
  async function readCandidates(b: Backend, nearAnchor = anchor) {
    const regionId = tripRegion.id;
    const placeIds = await b.t.query(functions.trips.candidatePlaces, {
      regionId,
      anchor: nearAnchor,
    });
    return b.t.query(functions.trips.candidates, { regionId, placeIds });
  }

  async function addCandidate(
    b: Backend,
    createdBy: Awaited<ReturnType<typeof addPerson>>,
    fields: {
      pin?: typeof near;
      regionId?: string;
      hidden?: boolean;
      draft?: boolean;
      story?: boolean;
      slug?: string;
    } = {},
  ) {
    const pin = fields.pin ?? near;
    return b.t.run((ctx) =>
      ctx.db.insert("place", {
        regionId: fields.regionId ?? tripRegion.id,
        createdBy,
        slug: fields.slug ?? "trip-test-place",
        visibility: fields.draft ? "draft" : "public",
        isMock: false,
        category: "cafe",
        mapPin: pin,
        mapCell: cellOf(pin),
        hasPeopleStories: fields.story ?? false,
        hasPublishedPage: false,
        ...(fields.story ? { confirmedAt: now } : {}),
        ...(fields.hidden ? { hiddenReason: "not_for_visitors" } : {}),
      }),
    );
  }

  it("respects region preview, visibility, distance, and current and previous exposure", async () => {
    const b = await setup();
    const shown = await addCandidate(b, b.member, { story: true });
    const far = { ...near, lat: near.lat + 0.008 };
    expect(cellOf(far)).toBe(cellOf(near));
    await addCandidate(b, b.member, { pin: far });
    await addCandidate(b, b.member, { regionId: "nagasaki" });
    await addCandidate(b, b.member, { hidden: true });
    await addCandidate(b, b.member, { draft: true });
    await b.t.run(async (ctx) => {
      await ctx.db.insert("placeExposure", {
        placeId: shown,
        weekKey: isoWeekKey(now, 8),
        count: 3,
      });
      await ctx.db.insert("placeExposure", {
        placeId: shown,
        weekKey: previousWeekKey(now, 8),
        count: 7,
      });
    });
    vi.stubEnv("REGIONS_PREVIEW", "");
    expect(await readCandidates(b)).toEqual([]);
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const first = await readCandidates(b);
    const second = await readCandidates(b, { near: far, withinMetres: 0 });
    expect(first).toEqual([
      {
        placeId: shown,
        slug: "trip-test-place",
        category: "cafe",
        pin: near,
        confirmed: true,
        hasStory: true,
        cautions: [],
        facts: [],
      },
    ]);
    expect(second).toMatchObject([{ pin: far, confirmed: false, hasStory: false }]);
    await expect(
      b.t.query(functions.trips.candidateExposure, { regionId: tripRegion.id, now }),
    ).resolves.toEqual({
      thisWeek: [{ placeId: shown, count: 3 }],
      lastWeek: [{ placeId: shown, count: 7 }],
    });
  });

  it("includes only published owner cautions, and only where the region shows them", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const placeId = await addCandidate(b, b.member);
    const claim = { placeId, kind: "caution" as const, cautionType: "cash_only" };
    const policy = region.regionPolicy(tripRegion.id);
    const policySpy = vi
      .spyOn(region, "regionPolicy")
      .mockReturnValue({ ...policy, realBusinessesDraftOnly: true });
    // These rows stand for the states the claim write gate controls.
    const id = await b.t.run((ctx) =>
      ctx.db.insert("claim", {
        ...claim,
        status: "published",
        origin: "creator_note",
        authorId: b.member,
        confirmedAt: now,
        textOriginal: "Cash only.",
        langOriginal: "en",
        isMock: false,
      }),
    );
    await addClaim(b, {
      ...claim,
      status: "proposed",
      cautionType: "closed_days",
      authorId: b.member,
    });
    const read = () => readCandidates(b);
    expect(await read()).toMatchObject([{ cautions: [] }]);
    policySpy.mockReturnValue({ ...policy, realBusinessesDraftOnly: false });
    expect(await read()).toMatchObject([{ cautions: ["cash_only"] }]);
    await b.t.run((ctx) => ctx.db.patch("claim", id, { status: "owner_confirmed" }));
    expect(await read()).toMatchObject([{ cautions: [] }]);
  });

  it("reads live member reports and skips hidden or removed reports", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const placeId = await addCandidate(b, b.member);
    const day = "2026-11-23";
    const factId = await b.t.run(async (ctx) => {
      const report = {
        placeId,
        regionId: tripRegion.id,
        basis: "member",
        personId: b.member,
        value: "yes",
        day,
        isMock: false,
      } as const;
      for (const status of ["removed", "hidden"] as const) {
        await ctx.db.insert("placeFact", { ...report, status, key: "steps_at_door" });
      }
      return ctx.db.insert("placeFact", { ...report, status: "live", key: "level_entrance" });
    });
    const result = await readCandidates(b);
    expect(result).toMatchObject([
      { facts: [{ key: "level_entrance", value: "yes", basis: "member", day, factId }] },
    ]);
  });

  it("keeps steps out of a step-free plan and cites a level entrance", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const ipoh = tripRegion.towns!.find(({ id }) => id === "ipoh")!.center;
    const steps = await addCandidate(b, b.member, { pin: ipoh, story: true });
    const level = await addCandidate(b, b.member, {
      pin: { lat: ipoh.lat + 0.001, lng: ipoh.lng },
      story: true,
    });
    const plan = () =>
      b.as("member").action(actions.plan, {
        consentVersion: TRIP_CONSENT_VERSION,
        request: request(),
        seed: "step-free-report",
      });
    expect(plannedStops((await plan()).plan).map(({ place }) => place)).toContainEqual(
      expect.objectContaining({ placeId: steps }),
    );
    const factId = await b.t.run(async (ctx) => {
      const report = {
        regionId: tripRegion.id,
        basis: "member",
        personId: b.member,
        value: "yes",
        day: "2026-11-23",
        isMock: false,
        status: "live",
      } as const;
      await ctx.db.insert("placeFact", { ...report, placeId: steps, key: "steps_at_door" });
      return ctx.db.insert("placeFact", { ...report, placeId: level, key: "level_entrance" });
    });

    const result = await plan();
    const places = result.plan.days.flatMap(({ items }) =>
      items.flatMap((item) =>
        item.kind === "stop" && "placeId" in item.place
          ? [{ id: item.place.placeId, checks: item.checks }]
          : [],
      ),
    );
    expect(places.map(({ id }) => id)).not.toContain(steps);
    expect(places.find(({ id }) => id === level)?.checks).toContainEqual({
      rule: "step-free",
      verdict: "met",
      restsOn: { kind: "member", factId },
    });
    expect(result.stops.find((stop) => stop?.placeId === level)?.facts).toContainEqual(
      expect.objectContaining({
        factId,
        reporterName: "Test Person (member)",
        day: "2026-11-23",
      }),
    );
  });

  it("plans real stops from the public places in the requested region", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const pin = townPin("ipoh");
    const publicPlace = await addCandidate(b, b.member, { pin, slug: "public-ipoh" });
    await addCandidate(b, b.member, { pin, draft: true, slug: "draft-ipoh", story: true });
    await addCandidate(b, b.member, { pin, hidden: true, slug: "hidden-ipoh", story: true });
    await addCandidate(b, b.member, {
      pin,
      regionId: "nagasaki",
      slug: "wrong-region",
      story: true,
    });
    const result = await b
      .as("member")
      .action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: request(), seed: "public" });
    expect(result.plan.days.map(({ index }) => index)).toEqual([1]);
    expect(plannedStops(result.plan).map(({ place }) => place)).toEqual([
      { placeId: publicPlace, slug: "public-ipoh" },
    ]);
    expect(result.stops).toMatchObject([{ placeId: publicPlace }]);
  });

  it("redraws just one stop and preserves every kept slot", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const pin = townPin("ipoh");
    for (let index = 0; index < 10; index++) {
      await addCandidate(b, b.member, { pin, slug: `ipoh-${index}`, story: true });
    }
    const plan = (input: TripRequest) =>
      b.as("member").action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: input, seed: "one-redraw" });
    const before = plannedStops((await plan(request())).plan);
    const target = before.find(({ slot }) => slot === "d1.open1")!;
    expect(target).toBeDefined();
    const kept = before.filter(({ slot }) => slot !== target.slot);
    expect(kept.length).toBeGreaterThan(0);
    const result = await plan({
      ...request(),
      keep: {
        stops: kept.map(({ slot, day, place, at, minutes, because }) => ({
          slot,
          day,
          place,
          at,
          minutes,
          because,
          hold: "time",
        })),
      },
      ops: [{ op: "redraw", slot: target.slot }],
    });
    const after = plannedStops(result.plan);
    expect(after.filter(({ slot }) => slot !== target.slot)).toEqual(kept);
    const replacement = after.find(({ slot }) => slot === target.slot);
    expect(replacement).toEqual(expect.objectContaining({ because: target.because }));
    expect(replacement?.place).not.toEqual(target.place);
    expect(after.map(({ place }) => place)).not.toContainEqual(target.place);
    expect(result.plan.moved?.map(({ slot, why }) => ({ slot, why }))).toEqual([
      { slot: target.slot, why: "redrawn" },
    ]);
  });

  it("loads the new route's candidates when an operation moves a night", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const input: TripRequest = { ...request(), days: 2, nights: ["ipoh"] };
    const moved: TripRequest = { ...input, ops: [{ op: "move_night", night: 1, to: "taiping" }] };
    const taiping = townPin("taiping");
    const newStop = await addCandidate(b, b.member, { pin: taiping, story: true });
    expect(engine.anchorsFor(input, tripRegion).map(({ near }) => near)).not.toContainEqual(
      taiping,
    );
    const result = await b.as("member").action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: moved, seed: "new-night" });
    expect(result.plan.days[0]?.night).toBe("taiping");
    expect(plannedStops(result.plan).map(({ place }) => place)).toContainEqual(
      expect.objectContaining({ placeId: newStop }),
    );
    expect(result.stops).toContainEqual(expect.objectContaining({ placeId: newStop }));
  });

  it("validates anchor bounds and caps each result group and detail query", async () => {
    const b = await setup();
    vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
    const read = (nearAnchor: typeof anchor) =>
      b.t.query(functions.trips.candidatePlaces, {
        regionId: tripRegion.id,
        anchor: nearAnchor,
      });
    await expect(read({ ...anchor, withinMetres: 100_001 })).rejects.toMatchObject(
      refusal("invalid_input"),
    );
    for (let i = 0; i < 401; i++) await addCandidate(b, b.member);
    const result = await read(anchor);
    expect(result).toHaveLength(400);
    await expect(
      b.t.query(functions.trips.candidates, {
        regionId: tripRegion.id,
        placeIds: result.slice(0, 51),
      }),
    ).rejects.toMatchObject(refusal("invalid_input"));
  });

  it("measures a real plan with 12 anchors of 400 distinct places", async () => {
    const b = await setup("open", { transactionLimits: {} });
    const regionId = tripRegion.id;
    vi.stubEnv("REGIONS_PREVIEW", regionId);
    const input: TripRequest = {
      ...request(),
      start: "kuala-lumpur",
      end: "alor-setar",
      days: 7,
      startDate: "2026-11-23",
      nights: ["tanjung-malim", "kampar", "ipoh", "taiping", "george-town", "sungai-petani"],
    };
    const anchors = engine.anchorsFor(input, tripRegion);
    expect(anchors).toHaveLength(12);
    for (const [anchorIndex, { near }] of anchors.entries()) {
      // The two George Town anchors overlap with each other and the mainland.
      // Seed opposite sides and put the mainland pool on the first side scanned.
      const pin = {
        lat:
          near.lat +
          (anchorIndex === 7 ? -0.026 : anchorIndex === 8 ? -0.05 : anchorIndex === 11 ? 0.026 : 0),
        lng: near.lng - (anchorIndex === 8 ? 0.132 : 0),
      };
      await b.t.run(async (ctx) => {
        for (let i = 0; i < 400; i++) {
          const placeId = await ctx.db.insert("place", {
            regionId,
            createdBy: b.member,
            slug: `dense-${anchorIndex}-${i}`,
            visibility: "public",
            isMock: false,
            category: "cafe",
            mapPin: pin,
            mapCell: cellOf(pin),
            hasPeopleStories: true,
            hasPublishedPage: false,
          });
          // Fully populate a detail batch at each anchor. The test backend scans
          // its in-memory fact table for every indexed lookup.
          if (i < 50) {
            for (const key of ["level_entrance", "steps_at_door"]) {
              await ctx.db.insert("placeFact", {
                placeId,
                regionId,
                key,
                basis: "member",
                personId: b.member,
                value: key === "level_entrance" ? "yes" : "no",
                day: "2026-11-23",
                status: "live",
                isMock: false,
              });
            }
          }
          for (const weekKey of [isoWeekKey(now, 8), previousWeekKey(now, 8)]) {
            await ctx.db.insert("placeExposure", { placeId, weekKey, count: 1 });
          }
        }
      });
    }
    const groups = [];
    let discoveryReads = 0;
    for (const anchor of anchors) {
      const { ids, reads } = await b.t.query(async (ctx) => {
        const ids = await ctx.runQuery(functions.trips.candidatePlaces, { regionId, anchor });
        return { ids, reads: (await ctx.meta.getTransactionMetrics()).documentsRead.used };
      });
      expect(ids).toHaveLength(400);
      groups.push(ids);
      discoveryReads += reads;
    }
    const ids = [...new Set(groups.flat())];
    expect(ids).toHaveLength(4800);
    const exposureReads = await b.t.query(async (ctx) => {
      await ctx.runQuery(functions.trips.candidateExposure, { regionId, now });
      return (await ctx.meta.getTransactionMetrics()).documentsRead.used;
    });
    let detailReads = 0;
    let maxDetailReads = 0;
    let detailRanges = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const placeIds = ids.slice(i, i + 50);
      const metrics = await b.t.query(async (ctx) => {
        const rows = await ctx.runQuery(functions.trips.candidates, { regionId, placeIds });
        expect(rows).toHaveLength(placeIds.length);
        return ctx.meta.getTransactionMetrics();
      });
      detailReads += metrics.documentsRead.used;
      maxDetailReads = Math.max(maxDetailReads, metrics.documentsRead.used);
      detailRanges += metrics.databaseQueries.used;
    }
    expect(detailReads).toBeGreaterThanOrEqual(ids.length);
    expect(detailRanges).toBeGreaterThan(4096);
    const start = performance.now();
    const result = await b.as("member").action(actions.plan, { consentVersion: TRIP_CONSENT_VERSION, request: input, seed: "dense" });
    const elapsed = performance.now() - start;
    expect(result.plan.days).toHaveLength(7);
    expect(result.stops.length).toBeGreaterThan(0);
    console.info(
      `Trip fixture: ${discoveryReads} discovery reads, ${exposureReads} exposure reads, ` +
        `${detailReads} candidate detail reads ` +
        `(${maxDetailReads} max per query), ${detailRanges} detail index ranges, ` +
        `${elapsed.toFixed(0)} ms plan.`,
    );
  }, 30_000);
});

const interpretation = {
  consentVersion: TRIP_CONSENT_VERSION,
  messages: [{ role: "user" as const, text: "My mum needs no stairs" }],
  outline: [],
  language: "en" as const,
};

function mockTripModel(
  model = scriptedModel([
    () => [
      {
        name: "submit",
        input: {
          proposals: [{ about: "My mum", kind: "rule", tag: "step-free", saidAs: "no stairs" }],
          questions: [],
        },
      },
    ],
  ]),
) {
  vi.stubEnv("AI_MODEL_PLAN", "test/provider");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-only-model-key");
  return vi.spyOn(modelFactory, "createLanguageModel").mockReturnValue(model);
}

describe("trip interpretation", () => {
  it("returns grounded edits through the action and drops out-of-outline targets", async () => {
    const b = await setup();
    const accepted = { op: { op: "redraw", slot: "d1.open1" }, saidAs: "draw again" };
    mockTripModel(
      scriptedModel([
        () => [
          {
            name: "submit",
            input: {
              proposals: [],
              questions: [],
              ops: [accepted, { op: { op: "lighten", day: 2 }, saidAs: "draw again" }],
            },
          },
        ],
      ]),
    );
    await expect(
      b.as("member").action(actions.interpret, {
        ...interpretation,
        messages: [{ role: "user", text: "Please draw again" }],
        outline: [{ day: 1, kind: "stop", slot: "d1.open1" }],
      }),
    ).resolves.toEqual({ state: "ai", proposals: [], questions: [], ops: [accepted] });
  });

  it("applies the gate before AI configuration or the quota", async () => {
    const b = await setup("trial");
    vi.stubEnv("AI_MODEL_PLAN", "");
    for (const caller of [b.t, b.as("ghost"), b.as("member")]) {
      await expect(caller.action(actions.interpret, interpretation)).rejects.toMatchObject(
        refusal("not_found"),
      );
    }
    await expect(b.as("trial").action(actions.interpret, interpretation)).rejects.toMatchObject(
      refusal("conflict"),
    );
    expect(await b.t.run((ctx) => ctx.db.query("rateLimit").take(10))).toEqual([]);
  });

  it("checks message sizes before contacting the model", async () => {
    const b = await setup();
    const model = mockTripModel();
    const oversized = [
      Array(9).fill(interpretation.messages[0]),
      [{ role: "user" as const, text: " ".repeat(701) }],
    ];
    for (const messages of oversized) {
      await expect(
        b.as("member").action(actions.interpret, { ...interpretation, messages }),
      ).rejects.toMatchObject(refusal("invalid_input"));
    }
    expect(model).not.toHaveBeenCalled();
  });

  it("returns vetted model output and stores only counters and consent", async () => {
    const b = await setup();
    const model = mockTripModel();
    const before = await tableRows(b);
    await expect(b.as("member").action(actions.interpret, interpretation)).resolves.toEqual({
      state: "ai",
      proposals: [{ about: "My mum", kind: "rule", tag: "step-free", saidAs: "no stairs" }],
      questions: [],
      ops: [],
    });
    expect(model).toHaveBeenCalledOnce();
    const after = await tableRows(b);
    expect(after.rateLimit).toHaveLength(2);
    expect({
      ...before,
      rateLimit: after.rateLimit,
      person: (before.person as Doc<"person">[]).map((person) =>
        person._id === b.member
          ? { ...person, tripConsent: { version: TRIP_CONSENT_VERSION, at: expect.any(Number) } }
          : person,
      ),
    }).toEqual(after);
  });

  it("falls back to the buttons when the configured model fails", async () => {
    const b = await setup();
    mockTripModel(scriptedModel([]));
    await expect(b.as("member").action(actions.interpret, interpretation)).resolves.toEqual({
      state: "plain",
      proposals: [],
      questions: [],
      ops: [],
    });
  });

  it.each([
    ["minute", 5],
    ["day", 40],
  ] as const)("caps interpretations per %s before contacting the model", async (window, limit) => {
    const b = await setup();
    const model = mockTripModel();
    await b.t.run((ctx) =>
      ctx.db.insert("rateLimit", {
        key: `trip:interpret:${window}:${b.member}`,
        count: limit - 1,
        windowStart: Date.now(),
      }),
    );
    await b.as("member").action(actions.interpret, interpretation);
    const rows = await b.t.run((ctx) => ctx.db.query("rateLimit").take(10));
    expect(rows).toContainEqual(
      expect.objectContaining({
        key: `trip:interpret:${window}:${b.member}`,
        count: limit,
      }),
    );
    await expect(b.as("member").action(actions.interpret, interpretation)).rejects.toMatchObject(
      refusal("rate_limited"),
    );
    expect(await b.t.run((ctx) => ctx.db.query("rateLimit").take(10))).toEqual(rows);
    expect(model).toHaveBeenCalledOnce();
  });
});
