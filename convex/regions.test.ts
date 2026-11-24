/// <reference types="vite/client" />
import type { ApiFromModules } from "convex/server";
import { afterEach, expect, it, vi } from "vitest";
import malaysiaWest from "../regions/malaysia-west.json";
import nagasaki from "../regions/nagasaki.json";
import * as languageModels from "../src/lib/ai/claim-extractor";
import { cellOf } from "../src/lib/geo/geohash";
import { fillGuesses } from "../src/lib/trip/request";
import {
  addClaim,
  addInterview,
  addOwner,
  addPerson,
  addPlace,
  addSource,
  errorCode,
  newBackend,
} from "../tests/convex/fixtures";
import { emptySubmit, scriptedModel } from "../tests/fixtures/planner";
import * as region from "./lib/region";
import { api as generatedApi, internal } from "./_generated/api";

const api = generatedApi as typeof generatedApi &
  ApiFromModules<{
    facts: typeof import("./facts");
    places: typeof import("./places");
    takedown: typeof import("./takedown");
    tripActions: typeof import("./tripActions");
    trips: typeof import("./trips");
    tripShare: typeof import("./tripShare");
  }>;
const modules = import.meta.glob("./**/*.ts");
const regionId = "nagasaki";
const japanSlug = "test-nagasaki-cafe";
const malaysiaSlug = "test-malaysia-cafe";
const japanPin = { lat: 32.7415, lng: 129.8755 };
const malaysiaPin = { lat: malaysiaWest.defaultCenter.lat, lng: malaysiaWest.defaultCenter.lng };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  vi.stubEnv("REGION_ID", regionId);
  vi.stubEnv("REGIONS_PREVIEW", "malaysia-west");
  const b = newBackend(modules);
  const steward = await addPerson(b, "steward", "steward");
  const base = {
    createdBy: steward,
    visibility: "public" as const,
    category: "cafe",
    withPin: false,
  };
  const japan = await addPlace(b, { ...base, regionId, slug: japanSlug });
  const malaysia = await addPlace(b, { ...base, regionId: "malaysia-west", slug: malaysiaSlug });
  await b.run(async ({ db }) => {
    for (const [placeId, pin] of [
      [japan, japanPin],
      [malaysia, malaysiaPin],
    ] as const) {
      await db.insert("pin", { ...pin, placeId, placedBy: steward, placedAt: 0 });
    }
  });
  return { ...b, japan, malaysia, steward };
}

it("keeps Plan my day and walk mode in Nagasaki while Malaysia is on", async () => {
  const b = await setup();
  expect(await b.t.query(api.places.bySlug, { slug: malaysiaSlug })).toMatchObject({
    _id: b.malaysia,
  });

  vi.stubEnv("AI_MODEL_PLAN", "claude-sonnet-5-5");
  vi.stubEnv("ANTHROPIC_API_KEY", "mock-anthropic-key");
  const model = scriptedModel([
    () => [{ name: "search_places", input: { category: "cafe" } }],
    () => [{ name: "submit_plan", input: emptySubmit }],
  ]);
  vi.spyOn(languageModels, "createLanguageModel").mockReturnValue(model);
  await b.as("steward").action(api.plannerActions.ask, {
    turns: [{ role: "user", text: "Which cafes are on the map?" }],
    memory: { avoid: [], interests: [], done: [] },
    start: { kind: "neighbourhood", id: "shinchi" },
    language: "en",
  });
  const results = JSON.stringify(
    model.doGenerateCalls[1]?.prompt.filter(({ role }) => role === "tool"),
  );
  expect(results).toContain(japanSlug);
  expect(results).not.toContain(malaysiaSlug);

  expect((await b.t.query(api.walk.forRegion, { regionId })).map(({ slug }) => slug)).toEqual([
    japanSlug,
  ]);
});

it("selects Nagasaki collection places only from the Nagasaki region", async () => {
  const b = await setup();
  const neighbourhoodId = "shinchi";
  const names = { ja: "新地中華街", en: "Shinchi" };
  const args = { regionId, neighbourhoodId };
  expect(
    await errorCode(
      b.t.mutation(internal.collection.createSet, {
        ...args,
        names,
        panels: Array.from({ length: nagasaki.collection.panelsPerSet }, () => [malaysiaSlug]),
      }),
    ),
  ).toBe("invalid_input");
  const setId = await b.run(async ({ db }) => {
    const setId = await db.insert("collectionSet", {
      ...args,
      names,
      panelCount: 1,
      status: "live",
    });
    await db.insert("collectionPanel", { setId, index: 0 });
    await db.insert("collectionPlace", { setId, panelIndex: 0, placeId: b.japan });
    return setId;
  });
  expect(await b.t.query(api.collection.forPlace, { placeId: b.malaysia })).toBeNull();
  expect(
    await errorCode(
      b.as("steward").mutation(api.collection.swapPlace, {
        setId,
        panelIndex: 0,
        addPlaceId: b.malaysia,
      }),
    ),
  ).toBe("invalid_input");

  // Simulate a cross-region link from before panel edits checked the set's region.
  await b.run(({ db }) =>
    db.insert("collectionPlace", { setId, panelIndex: 0, placeId: b.malaysia }),
  );
  for (const viewer of [b.t, b.as("steward")]) {
    const set = await viewer.query(api.collection.set, args);
    expect(set?.panels.flatMap(({ places }) => places.map(({ placeId }) => placeId))).toEqual([
      b.japan,
    ]);
  }
});

it("removes a disabled region from the map, slug lookup and town coverage even for a steward", async () => {
  const b = await setup();
  const cells = [cellOf(japanPin), cellOf(malaysiaPin)];
  const steward = b.as("steward");
  expect((await steward.query(api.places.inCells, { cells })).map(({ _id }) => _id)).toEqual([
    b.japan,
    b.malaysia,
  ]);
  expect(await steward.query(api.places.bySlug, { slug: malaysiaSlug })).not.toBeNull();
  expect(await steward.query(api.places.coverage, {})).toHaveLength(
    nagasaki.towns.length + malaysiaWest.towns.length,
  );

  vi.stubEnv("REGIONS_PREVIEW", "");
  expect((await steward.query(api.places.inCells, { cells })).map(({ _id }) => _id)).toEqual([
    b.japan,
  ]);
  expect(await steward.query(api.places.bySlug, { slug: malaysiaSlug })).toBeNull();
  expect(await steward.query(api.places.coverage, {})).toEqual(
    nagasaki.towns.map(({ id, names, center, radiusMetres }) => ({
      id,
      names,
      center,
      radiusMetres,
    })),
  );
});

const malaysiaRegion = "malaysia-west";
const malaysiaArgs = { regionId: malaysiaRegion };
const page = { numItems: 20, cursor: null };

function preview(on: boolean) {
  vi.stubEnv("REGIONS_PREVIEW", on ? malaysiaRegion : "");
}

it("gates the explicit map, slug, ID and personal and steward place lists", async () => {
  const b = await setup();
  const steward = b.as("steward");
  const owner = await addPerson(b, "owner", "business_owner");
  await addOwner(b, b.malaysia, owner, b.steward);
  await b.run(({ db }) => db.patch("place", b.malaysia, { confirmedAt: 1 }));
  const placeId = b.malaysia;
  const draft = await addPlace(b, {
    createdBy: b.steward,
    regionId: malaysiaRegion,
    withNames: false,
    withPin: false,
  });
  await b.run(({ db }) => db.patch("place", draft, { awaitingSteward: true }));
  const missing = [
    ["listForMap", () => b.t.query(api.places.listForMap, malaysiaArgs), []],
    [
      "getBySlug",
      () => b.t.query(api.places.getBySlug, { ...malaysiaArgs, slug: malaysiaSlug }),
      null,
    ],
    ["get", () => steward.query(api.places.get, { placeId }), null],
    ["listMine", () => steward.query(api.places.listMine, malaysiaArgs), []],
    ["listOwned", () => b.as("owner").query(api.places.listOwned, {}), []],
    ["listAll", () => steward.query(api.places.listAll, malaysiaArgs), []],
    ["listWaiting", () => steward.query(api.places.listWaiting, malaysiaArgs), []],
  ] as const;
  preview(false);
  for (const [name, call, empty] of missing) expect(await call(), name).toEqual(empty);
  expect(await b.t.query(api.places.get, { placeId: b.japan })).toMatchObject({ slug: japanSlug });
  const names = [{ lang: "en", script: "latin" as const, value: "New cafe", isPrimary: true }];
  const create = () =>
    steward.mutation(api.places.create, {
      ...malaysiaArgs,
      kind: "business",
      names,
      pin: malaysiaPin,
    });
  const edit = () => steward.mutation(api.places.setCategory, { placeId, clear: true });
  const decline = () => steward.mutation(api.places.declineWaiting, { placeId: draft });
  const placeWrites = [
    create,
    edit,
    decline,
    () => steward.mutation(api.places.updateNames, { placeId, names }),
    () => steward.mutation(api.places.movePin, { placeId, ...malaysiaPin }),
    () => steward.mutation(api.places.setKind, { placeId, kind: "landmark" }),
    () => steward.mutation(api.places.setVisibility, { placeId, visibility: "draft" }),
    () => steward.mutation(api.places.attachOwner, { placeId, personId: owner }),
  ];
  for (const write of placeWrites) expect(await errorCode(write())).toBe("not_found");
  expect(await b.run(({ db }) => db.get("place", placeId))).toMatchObject({ category: "cafe" });

  preview(true);
  for (const [name, call, empty] of missing) expect(await call(), name).not.toEqual(empty);
  await edit();
  await decline();
  expect(await create()).toMatchObject({ placeId: expect.any(String) });
});

it("gates collection sets, progress and edits as well as walk and connector draws", async () => {
  const b = await setup();
  const steward = b.as("steward");
  const placeId = b.malaysia;
  const neighbourhoodId = "fixture-neighbourhood";
  const setId = await b.run(async ({ db }) => {
    const setId = await db.insert("collectionSet", {
      ...malaysiaArgs,
      neighbourhoodId,
      names: { en: "Test set" },
      panelCount: 1,
      status: "live",
    });
    await db.insert("collectionPanel", { setId, index: 0 });
    await db.insert("collectionPlace", { setId, panelIndex: 0, placeId });
    await db.insert("personCollection", { personId: b.steward, badges: [], visits: [] });
    return setId;
  });
  const checkIn = () => steward.mutation(api.collection.checkIn, { placeId });
  await checkIn();
  const draws = [
    () => b.t.mutation(api.connector.omikuji, malaysiaArgs),
    () => b.t.mutation(api.connector.omikujiToday, malaysiaArgs),
    () =>
      b.t.mutation(api.connector.walk, {
        ...malaysiaArgs,
        start: { kind: "place", slug: malaysiaSlug },
        count: 2,
        avoid: [],
        interests: [],
        adventurousness: "mixed",
      }),
  ];
  const pickLine = () => steward.mutation(api.collection.pickLine, { placeId, en: null });
  const setStatus = () => steward.mutation(api.collection.setStatus, { setId, status: "draft" });
  const book = () => steward.query(api.collection.book, malaysiaArgs);
  const set = () => steward.query(api.collection.set, { ...malaysiaArgs, neighbourhoodId });
  const overview = () => steward.query(api.collection.listForSteward, malaysiaArgs);
  const forPlace = () => b.t.query(api.collection.forPlace, { placeId });
  const walk = () => b.t.query(api.walk.forRegion, malaysiaArgs);
  const missions = () => b.t.query(api.missions.forRegion, { ...malaysiaArgs, now: Date.now() });
  preview(false);
  expect(await book()).toEqual({ sets: [], badges: [] });
  expect((await steward.query(api.collection.book, { regionId })).badges).toEqual([]);
  expect(await set()).toBeNull();
  expect(await overview()).toEqual([]);
  expect(await forPlace()).toBeNull();
  expect(await walk()).toEqual([]);
  expect(await missions()).toEqual([]);
  for (const write of [checkIn, pickLine, setStatus, ...draws]) {
    expect(await errorCode(write())).toBe("not_found");
  }
  expect(
    await errorCode(
      steward.mutation(api.collection.swapPlace, { setId, panelIndex: 0, removePlaceId: placeId }),
    ),
  ).toBe("not_found");

  preview(true);
  expect(await book()).toMatchObject({ sets: [{ id: setId }], badges: [{ setId }] });
  expect(await set()).toMatchObject({ id: setId, lastVisitedPlaceId: placeId });
  expect(await overview()).toHaveLength(1);
  expect(await forPlace()).not.toBeNull();
  expect(await walk()).toMatchObject([{ slug: malaysiaSlug }]);
  const [slip, todaysSlips, route] = draws;
  expect(await slip!()).toMatchObject({ ok: true, place: { slug: malaysiaSlug } });
  expect(await todaysSlips!()).toBeTruthy();
  expect(await route!()).toBeTruthy();
  await pickLine();
  await setStatus();
});

it("gates stories, sharing, linked sources, photos and interview access", async () => {
  const b = await setup();
  const steward = b.as("steward");
  const placeId = b.malaysia;
  const creator = await addPerson(b, "creator", "creator");
  const interviewId = await addInterview(b, { placeId, interviewerId: creator, language: "en" });
  const sourceUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const sourceId = await addSource(b, {
    placeId,
    addedBy: b.steward,
    demoConsentBy: b.steward,
    adapter: "youtube",
    url: sourceUrl,
  });
  const storyId = await b.run(({ db }) =>
    db.insert("story", {
      placeId,
      authorPersonId: b.steward,
      body: "A test story at the Malaysian cafe.",
      lang: "en",
      status: "live",
      isMock: false,
      shareConsentAt: 1,
      connectorAllowedAt: 1,
    }),
  );
  const photoId = await b.run(({ db }) =>
    db.insert("storyPhoto", {
      placeId,
      storyId,
      uploaderPersonId: b.steward,
      status: "waiting",
      width: 32,
      height: 32,
      incomingKey: "incoming/fixture.jpg",
      key: "photos/fixture.jpg",
    }),
  );
  const upload = await b.run(({ db }) =>
    db.insert("storyPhoto", {
      placeId,
      uploaderPersonId: b.steward,
      status: "uploading",
      incomingKey: "incoming/permit.jpg",
      key: "photos/permit.jpg",
    }),
  );
  const claimId = await addClaim(b, { placeId, authorId: b.steward });
  const postId = await b.run(({ db }) =>
    db.insert("instagramPost", {
      ...malaysiaArgs,
      placeId,
      storyId,
      status: "queued",
      approvedAt: 1,
      approvedBy: b.steward,
      imageToken: "fixture-token",
      attempts: 0,
    }),
  );
  const instagram = () =>
    b.t.query(api.instagramPosts.cardForPost, { postId, token: "fixture-token" });
  const postQueue = () => steward.query(api.instagramPosts.overview, malaysiaArgs);
  const cancel = () => steward.mutation(api.instagramPosts.cancel, { postId });
  const peek = () => b.t.query(api.links.peek, { sourceId });
  const follow = () => b.t.mutation(api.links.follow, { sourceId });
  const sourceList = () => b.t.query(api.sources.listForPlace, { placeId });
  const stories = () => b.t.query(api.stories.listForPlace, { placeId });
  const card = () => b.t.query(api.storyShare.card, { storyId });
  const latest = () => b.t.query(api.stories.latest, malaysiaArgs);
  const photoQueue = async () => (await steward.query(api.storyPhotos.listWaiting, {})).photos;
  const interviews = () => b.as("creator").query(api.interviews.listMine, {});
  const editUpload = () =>
    steward.mutation(api.storyPhotos.completeUpload, { photoId: upload, width: 32, height: 32 });
  const lookupInterview = () => b.as("creator").query(api.interviews.get, { interviewId });
  const markGone = () => steward.mutation(api.sources.markGone, { sourceId });

  preview(false);
  for (const call of [sourceList, stories, latest, photoQueue, interviews])
    expect(await call()).toEqual([]);
  expect(await card()).toBeNull();
  expect(await instagram()).toBeNull();
  expect((await postQueue()).posts).toEqual([]);
  expect(await peek()).toBeNull();
  expect(await follow()).toBeNull();
  expect(await b.run(({ db }) => db.query("linkCountDaily").take(1))).toEqual([]);
  expect(await errorCode(cancel())).toBe("not_found");
  expect(await steward.query(api.storyShare.consentOf, { storyId })).toBe(false);
  expect(await steward.query(api.storyConnector.choiceOf, { storyId })).toBeNull();
  expect(await steward.query(api.storyPhotos.forPlace, { placeId })).toEqual({
    allowed: false,
    maxPerStory: 0,
    waitsUntil: null,
  });
  const rejected = [
    lookupInterview,
    editUpload,
    markGone,
    () => steward.query(api.storyPhotos.uploadTicket, { photoId: upload }),
    () => steward.mutation(api.storyPhotos.beginUpload, { placeId }),
    () => steward.mutation(api.storyPhotos.approve, { photoId }),
    () => steward.mutation(api.storyPhotos.remove, { photoId }),
    () => steward.mutation(api.stories.add, { placeId, body: "Test story", lang: "en" }),
    () => steward.mutation(api.stories.remove, { storyId }),
    () => steward.mutation(api.stories.clearQuestion, { storyId }),
    () => steward.mutation(api.storyShare.withdraw, { storyId }),
    () => steward.mutation(api.storyConnector.setAllowed, { storyId, on: false }),
    () => steward.mutation(api.sources.remove, { sourceId }),
    () => steward.mutation(api.pages.compose, { placeId }),
    () => steward.mutation(api.placeStories.request, { placeId }),
    () => steward.mutation(api.interviews.withdraw, { interviewId }),
    () =>
      steward.mutation(api.claims.setHumanTranslation, {
        claimId,
        lang: "en",
        text: "Test translation",
      }),
  ];
  for (const call of rejected) expect(await errorCode(call()), call.toString()).toBe("not_found");

  preview(true);
  for (const call of [sourceList, stories, latest, photoQueue, interviews])
    expect(await call()).not.toEqual([]);
  expect(await card()).toMatchObject({ placeSlug: malaysiaSlug });
  expect((await postQueue()).posts).toMatchObject([{ postId }]);
  expect(await peek()).toBe(sourceUrl);
  expect(await follow()).toBe(sourceUrl);
  await cancel();
  expect(await lookupInterview()).toBeTruthy();
  await editUpload();
  await steward.mutation(api.storyPhotos.approve, { photoId });
  await markGone();
});

it("gates checks, facts and takedown records by their targets", async () => {
  const b = await setup();
  vi.spyOn(region, "factsOn").mockReturnValue(true);
  const steward = b.as("steward");
  const placeId = b.malaysia;
  const fact = { placeId, key: "steps_at_door", value: "yes" as const };
  const factId = await steward.mutation(api.facts.report, fact);
  const report = () => steward.mutation(api.checks.report, { placeId, problem: "details" });
  await report();
  const [check] = await steward.query(api.checks.listOpenReports, malaysiaArgs);
  const input = {
    pageUrl: `/en/places/${malaysiaSlug}`,
    details: "Review this practical fact at the test cafe.",
    privacyOrMinor: false,
    locale: "en" as const,
  };
  const receipt = await b.t.mutation(api.takedown.submit, { ...input, factId });
  const queue = () => steward.query(api.takedown.list, { paginationOpts: page });
  const [request] = (await queue()).page;
  const outcome = "The practical fact should stay available.";
  const decide = () =>
    steward.mutation(api.takedown.decide, {
      requestId: request!._id,
      status: "closed",
      outcome,
    });
  const resolve = () =>
    steward.mutation(api.checks.resolveReport, {
      checkId: check!._id,
      outcome: "kept",
    });
  const status = () => b.t.query(api.takedown.statusByCode, { code: receipt.code });

  preview(false);
  expect(await b.t.query(api.facts.forPlace, { placeId })).toEqual([]);
  expect(await steward.query(api.checks.listOpenReports, malaysiaArgs)).toEqual([]);
  expect(await status()).toBeNull();
  expect((await queue()).page).toEqual([]);
  expect(await b.t.mutation(api.takedown.submit, input)).toMatchObject({ matchedPlace: false });
  for (const write of [
    report,
    decide,
    resolve,
    () => steward.mutation(api.checks.confirm, { placeId }),
    () => steward.mutation(api.facts.report, fact),
    () => steward.mutation(api.facts.remove, { factId }),
    () => steward.mutation(api.facts.hide, { factId, reason: outcome }),
    () => b.t.mutation(api.takedown.submit, { ...input, factId }),
  ])
    expect(await errorCode(write()), write.toString()).toBe("not_found");
  expect(await b.run(({ db }) => db.get("placeFact", factId))).toMatchObject({ status: "live" });

  preview(true);
  expect(await b.t.query(api.facts.forPlace, { placeId })).toMatchObject([{ _id: factId }]);
  expect(await steward.query(api.checks.listOpenReports, malaysiaArgs)).toMatchObject([
    { _id: check!._id },
  ]);
  expect(await status()).toMatchObject({ status: "received" });
  expect((await queue()).page).toContainEqual(expect.objectContaining({ _id: request!._id }));
  expect(await b.t.mutation(api.takedown.submit, input)).toMatchObject({ matchedPlace: true });
  await resolve();
  await decide();
  await steward.mutation(api.facts.remove, { factId });
});

it("gates public trip stops and shared trip codes and checks all stops before sharing", async () => {
  const b = await setup();
  vi.spyOn(region, "tripSwitch").mockReturnValue("open");
  const steward = b.as("steward");
  const stop = (placeId: string) => ({
    kind: "stop" as const,
    placeId,
    at: "10:00",
    minutes: 20,
    checks: [],
  });
  const share = {
    deviceTripId: "malaysia-fixture",
    title: "Day out",
    days: [{ index: 1, items: [stop(b.malaysia)] }],
  };
  const create = () => steward.mutation(api.tripShare.create, share);
  const { code } = await create();
  const tripRegion = region.regionConfig(malaysiaRegion);
  const plan = () =>
    steward.action(api.tripActions.plan, {
      request: {
        ...malaysiaArgs,
        start: "ipoh",
        end: "ipoh",
        days: 1,
        pins: [],
        party: fillGuesses(
          {
            travellers: [{ key: "t1", ageBand: "older", rules: [], likes: [], skips: [] }],
          },
          tripRegion,
        ),
      },
    });
  const read = (code: string) => b.t.query(api.tripShare.read, { code });
  const remove = () => steward.mutation(api.tripShare.remove, { code });
  const stops = () => steward.query(api.trips.stops, { placeIds: [b.japan, b.malaysia] });
  const mixed = () =>
    steward.mutation(api.tripShare.create, {
      ...share,
      deviceTripId: "mixed-fixture",
      days: [{ index: 1, items: [stop(b.japan), { ...stop(b.malaysia), at: "11:00" }] }],
    });

  preview(false);
  expect(await stops()).toMatchObject([{ slug: japanSlug }, null]);
  expect(await errorCode(plan())).toBe("not_found");
  expect(await read(code)).toBeNull();
  for (const write of [create, mixed, remove]) expect(await errorCode(write())).toBe("not_found");

  preview(true);
  expect(await stops()).toMatchObject([{ slug: japanSlug }, { slug: malaysiaSlug }]);
  expect(await plan()).toMatchObject({ seed: expect.any(String) });
  expect(await read(code)).toMatchObject({
    regionId: malaysiaRegion,
    stops: [{ slug: malaysiaSlug }],
  });
  expect(await mixed()).toMatchObject({ code: expect.any(String) });
  await remove();
});

it("lets the internal importer seed an off region before stewards can read or change it", async () => {
  const b = await setup();
  const steward = b.as("steward");
  preview(false);
  expect(
    await b.t.mutation(internal.osmSeed.importCandidates, {
      ...malaysiaArgs,
      retrievedAt: 1,
      candidates: [
        {
          ...malaysiaPin,
          osmType: "node",
          osmId: 123456789,
          tags: { name: "Fixture Cafe", amenity: "cafe" },
        },
      ],
    }),
  ).toMatchObject({ inserted: 1 });
  const candidate = await b.run(({ db }) => db.query("seedOsmCandidate").first());
  const list = () =>
    steward.query(api.osmSeed.listCandidates, { ...malaysiaArgs, paginationOpts: page });
  const dismiss = () =>
    steward.mutation(api.osmSeed.dismissCandidate, { candidateId: candidate!._id });
  expect((await list()).page).toEqual([]);
  expect(await errorCode(dismiss())).toBe("not_found");

  preview(true);
  expect((await list()).page).toMatchObject([{ _id: candidate!._id }]);
  await dismiss();
});
