/// <reference types="vite/client" />
import { anyApi, type ApiFromModules } from "convex/server";
import { afterEach, expect, it, vi } from "vitest";
import * as modelFactory from "../src/lib/ai/claim-extractor";
import { convexConnectorData } from "../src/lib/connector/convex-data";
import { CONNECTOR_DEFAULTS } from "../src/lib/connector/policy";
import { getPlace, searchPlaces } from "../src/lib/connector/tools";
import { isoWeekKey } from "../src/lib/draw/time";
import { getRegionConfig } from "../src/lib/region/registry";
import { storiedPlaces } from "../src/lib/seo/listing";
import { llmsText } from "../src/lib/seo/llms";
import { PUBLIC_PAGES, sitemapXml } from "../src/lib/seo/site";
import * as engine from "../src/lib/trip";
import { buildTripShare } from "../src/lib/trip/share";
import { buildTripRequest } from "../src/lib/trip/snapshot";
import { storedPartySchema, storedTripSchema } from "../src/lib/trip/storage";
import { addPerson, addPlace, newBackend, type Backend } from "../tests/convex/fixtures";
import { scriptedModel } from "../tests/fixtures/planner";
import { api } from "./_generated/api";
import * as region from "./lib/region";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const functions = anyApi as unknown as ApiFromModules<{
  facts: typeof import("./facts");
  trips: typeof import("./trips");
  tripActions: typeof import("./tripActions");
  tripShare: typeof import("./tripShare");
  people: typeof import("./people");
}>;
const signedOut = vi.hoisted(() => ({ backend: null as Backend["t"] | null }));
vi.mock("convex/nextjs", () => ({
  fetchQuery: (ref: Parameters<Backend["t"]["query"]>[0], args: Record<string, unknown>) =>
    signedOut.backend!.query(ref, args),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  signedOut.backend = null;
});

it("keeps a planned, interpreted and shared party out of the public surfaces and other draws", async () => {
  const b = newBackend(modules);
  signedOut.backend = b.t;
  const now = Date.UTC(2026, 10, 24, 2);
  const home = getRegionConfig("nagasaki")!;
  const tripRegion = getRegionConfig("malaysia-west")!;
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.spyOn(region, "tripSwitch").mockReturnValue("open");
  vi.stubEnv("REGIONS_PREVIEW", tripRegion.id);
  vi.stubEnv("AI_MODEL_PLAN", "test/provider");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-only-model-key");
  vi.spyOn(modelFactory, "createLanguageModel").mockReturnValue(
    scriptedModel([
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
  );

  const organiser = await addPerson(b, "organiser", "user");
  const other = await addPerson(b, "other", "user");
  const slug = "test-public-hill-cafe";
  const placeId = await addPlace(b, {
    createdBy: other,
    visibility: "public",
    slug,
    category: "cafe",
  });
  await b.as("other").mutation(api.stories.add, {
    placeId,
    body: "A story already on the place page.",
    lang: "en",
    connectorAllowed: true,
  });
  await b.run((ctx) =>
    ctx.db.insert("placeExposure", {
      placeId,
      weekKey: isoWeekKey(now, home.collection.utcOffsetHours),
      count: 4,
    }),
  );

  const party = storedPartySchema.parse({
    id: "private-party-id",
    name: "private-party-name",
    kept: true,
    travellers: [
      {
        key: "t8",
        label: "private-turn-label",
        ageBand: "older",
        rules: ["step-free"],
        likes: ["coffee"],
        skips: [],
      },
    ],
  });
  const trip = storedTripSchema.parse({
    id: "private-device-trip",
    regionId: tripRegion.id,
    partyId: party.id,
    start: "ipoh",
    end: "ipoh",
    days: 1,
    pins: [],
    changes: [],
    purpose: "private-purpose",
    status: "planning",
  });
  // Fix the chosen stop so the privacy assertion always exercises sharing a turn and a rule.
  vi.spyOn(engine, "planTrip").mockReturnValue({
    days: [
      {
        index: 1,
        calendar: [],
        notes: [],
        driveMinutes: 0,
        items: [
          {
            kind: "stop",
            slot: "private-slot",
            at: "10:00",
            minutes: 20,
            place: { placeId, slug },
            because: { kind: "turn", for: party.travellers[0]!.key, likes: ["coffee"] },
            checks: [{ rule: "step-free", verdict: "not_known", reason: "no_record" }],
            hasStory: true,
            confirmed: false,
          },
        ],
      },
    ],
    unmet: [],
  });

  const caller = b.as("organiser");
  const otherCaller = b.as("other");
  const connector = {
    region: home,
    origin: "https://noren.yooi.me",
    data: convexConnectorData(home.id),
    options: CONNECTOR_DEFAULTS,
    now: () => now,
  };
  const readSurfaces = async () => {
    const listed = await storiedPlaces([home, tripRegion]);
    const args = { placeId };
    return {
      listed,
      sitemap: sitemapXml(home, [
        ...PUBLIC_PAGES,
        ...listed.map((place) => `places/${place.slug}`),
      ]),
      llms: llmsText(home, listed, [home, tripRegion]),
      map: await b.t.query(api.places.listForMap, { regionId: home.id }),
      page: await b.t.query(api.places.getBySlug, { regionId: home.id, slug }),
      claims: await b.t.query(api.pages.getPublished, args),
      stories: await b.t.query(api.stories.listForPlace, args),
      stitched: await b.t.query(api.placeStories.forPlace, args),
      sources: await b.t.query(api.sources.listForPlace, args),
      facts: await b.t.query(functions.facts.forPlace, args),
      connectorPlace: await getPlace.run(getPlace.inputSchema.parse({ slug }), connector),
      connectorSearch: await searchPlaces.run(
        searchPlaces.inputSchema.parse({ category: "cafe" }),
        connector,
      ),
      signedOutProfile: await b.t.query(functions.people.current, {}),
      organiserProfile: await caller.query(functions.people.current, {}),
      otherProfile: await otherCaller.query(functions.people.current, {}),
    };
  };
  const exposure = () => b.run((ctx) => ctx.db.query("placeExposure").take(10));
  const ordinaryRows = () =>
    b.run((ctx) =>
      Promise.all(
        (Object.keys(schema.tables) as (keyof typeof schema.tables)[])
          .filter((table) => table !== "rateLimit" && table !== "tripShare")
          .map((table) => ctx.db.query(table).take(100)),
      ),
    );
  const otherDraw = () => otherCaller.mutation(api.connector.omikujiToday, { regionId: home.id });
  const before = await readSurfaces();
  expect(before.listed).toMatchObject([{ slug }]);
  expect(before.sitemap).toContain(slug);
  expect(before.llms).toContain(slug);
  expect(before.connectorPlace.ok).toBe(true);
  expect(before.connectorSearch.ok).toBe(true);
  expect(before.signedOutProfile).toBeNull();
  const previousDraw = await otherDraw();
  expect(previousDraw.slips).not.toHaveLength(0);
  const previousExposure = await exposure();
  const previousRows = await ordinaryRows();

  const { plan, seed } = await caller.action(functions.tripActions.plan, {
    request: buildTripRequest(trip, party, tripRegion),
    seed: "private-plan-seed",
  });
  expect(seed).toBe("private-plan-seed");
  expect(
    await caller.action(functions.tripActions.interpret, {
      messages: [{ role: "user", text: "My mum needs no stairs. private-chat-person" }],
      outline: [],
      language: "en",
    }),
  ).toMatchObject({ state: "ai", proposals: [{ about: "My mum" }] });
  const packed = buildTripShare(
    storedTripSchema.parse({ ...trip, plan }),
    party,
    "private-link-title",
  );
  const { code } = await caller.mutation(functions.tripShare.create, packed);
  expect(await b.t.query(functions.tripShare.read, { code })).toMatchObject({
    title: "private-link-title",
    days: [{ items: [{ turnLabel: "private-turn-label", checks: [{ rule: "step-free" }] }] }],
  });

  const after = await readSurfaces();
  expect(after).toEqual(before);
  for (const marker of [
    code,
    party.id,
    party.name,
    trip.id,
    trip.purpose,
    "private-chat-person",
    "private-slot",
    '"t8"',
    "private-turn-label",
    "private-link-title",
  ]) {
    expect(JSON.stringify(after)).not.toContain(marker);
  }
  expect(await exposure()).toEqual(previousExposure);
  expect(await ordinaryRows()).toEqual(previousRows);
  expect(await otherDraw()).toEqual(previousDraw);

  const [row] = await b.run((ctx) => ctx.db.query("tripShare").take(2));
  expect(row).toMatchObject({ ...packed, code, ownerPersonId: organiser });
  for (const marker of [
    party.id,
    party.name,
    trip.purpose,
    "private-chat-person",
    "private-slot",
    '"t8"',
    "ageBand",
    '"likes"',
  ]) {
    expect(JSON.stringify(row)).not.toContain(marker);
  }
});
