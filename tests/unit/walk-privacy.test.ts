import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { walkMessages } from "@/lib/i18n/messages/walk";
import { WalkController } from "@/lib/walk/controller";
import { convexWalkData } from "@/lib/walk/convex-data";
import type { TodaysSlips } from "@/lib/walk/types";
import { ORIGIN, northOf, walkPlace } from "../fixtures/walk";
import {
  LOCAL_VOICES,
  fakeGeolocation,
  fakeSpeech,
  fakeWakeLock,
  settle,
} from "../fixtures/walk-ports";

// The promise to keep literally true: while a person walks, their location, a neighbourhood worked
// out from it, and the ids of places near them never reach Noren. The page makes exactly two
// requests, and both carry only the region.

afterEach(() => vi.unstubAllGlobals());

const places = [
  walkPlace("kenjis", ORIGIN, { story: true }),
  walkPlace("quiet-lane", northOf(ORIGIN, 300)),
  walkPlace("far-shop", northOf(ORIGIN, 900)),
];
const slips: TodaysSlips = {
  day: "2026-11-10",
  slips: [
    {
      neighbourhoodId: "shinchi",
      place: { slug: "kenjis", names: [], hasStory: true, pin: ORIGIN },
    },
  ],
};

function fakeConvex() {
  return {
    query: vi.fn(async () => places),
    mutation: vi.fn(async () => slips),
  };
}

/** Every request the fake Convex client was asked to make: the function and its arguments. */
const requests = (client: ReturnType<typeof fakeConvex>) =>
  [...client.query.mock.calls, ...client.mutation.mock.calls].map((call) => {
    const [reference, ...args] = call as unknown as [never, ...unknown[]];
    return { name: getFunctionName(reference), args };
  });

describe("the requests walk mode makes", () => {
  it("are two, and each carries only the region", () => {
    const client = fakeConvex();
    const data = convexWalkData(client as never, "nagasaki");
    void data.loadPlaces();
    void data.drawToday();
    expect(requests(client)).toEqual([
      { name: "walk:forRegion", args: [{ regionId: "nagasaki" }] },
      { name: "connector:omikujiToday", args: [{ regionId: "nagasaki" }] },
    ]);
  });

  it("stay those two through a whole walk past places, and never say where the phone is", async () => {
    const fetchSpy = vi.fn();
    const socket = vi.fn();
    const beacon = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("WebSocket", socket);
    vi.stubGlobal("XMLHttpRequest", socket);
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const client = fakeConvex();
    const geolocation = fakeGeolocation();
    let now = 0;
    const controller = new WalkController(
      {
        data: convexWalkData(client as never, "nagasaki"),
        geolocation,
        wakeLock: fakeWakeLock(),
        speech: fakeSpeech(LOCAL_VOICES),
        now: () => now,
        random: () => 0.4,
        onVisible: () => () => undefined,
      },
      { locale: "en", accuracyAllowanceMetres: 30, messages: walkMessages.en },
    );
    controller.setSound(true);
    await controller.start();
    await settle();
    // Walk north past all three places, a reading every 20 seconds, with a detour and a nudge on the way.
    for (let metres = -50; metres <= 1000; metres += 25) {
      now += 20_000;
      const at = northOf(ORIGIN, metres);
      geolocation.emit(at.lat, at.lng, 8);
      if (controller.getSnapshot().current) controller.dismiss();
    }
    controller.stop();

    // Exactly the one request for the places: no arguments but the region.
    expect(requests(client)).toEqual([
      { name: "walk:forRegion", args: [{ regionId: "nagasaki" }] },
    ]);
    // And it holds that nothing else of the person's travelled by any other road.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
    // A card really did come up on this walk, so the test is not passing on an empty walk.
    expect(controller.getSnapshot().earlier.length).toBeGreaterThan(0);
    const sent = JSON.stringify(requests(client));
    for (const secret of [
      "32.74",
      "129.87",
      "kenjis",
      "quiet-lane",
      "far-shop",
      "shinchi",
      "lat",
      "lng",
    ])
      expect(sent).not.toContain(secret);
  });

  it("do not change when the person draws the omikuji for the neighbourhood they are in", async () => {
    const client = fakeConvex();
    const data = convexWalkData(client as never, "nagasaki");
    // The phone picks the slip itself; the draw asks for all of them.
    await data.loadPlaces();
    const drawn = await data.drawToday();
    expect(drawn.slips.map((slip) => slip.neighbourhoodId)).toContain("shinchi");
    expect(requests(client).map(({ args }) => args)).toEqual([
      [{ regionId: "nagasaki" }],
      [{ regionId: "nagasaki" }],
    ]);
  });
});

// A guard against a later change quietly adding a way out. Walk mode's code may talk to Noren in
// one file (convex-data.ts) and get the client in one (walk-container.tsx); it may not use any
// other network, storage or logging, any of which could carry a position.
describe("walk mode's source", () => {
  const ROOT = path.resolve(import.meta.dirname, "../..");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  const files = [
    ...walk(path.join(ROOT, "src/lib/walk")),
    ...walk(path.join(ROOT, "src/components/walk")),
    ...walk(path.join(ROOT, "src/app/[lang]/walk")),
  ];

  it("has files to check", () => {
    expect(files.map((file) => path.basename(file))).toEqual(
      expect.arrayContaining(["controller.ts", "convex-data.ts", "walk-container.tsx", "page.tsx"]),
    );
  });

  const forbidden: [string, RegExp][] = [
    ["fetch", /\bfetch\s*\(/],
    ["a beacon", /sendBeacon/],
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["a socket", /\b(WebSocket|EventSource)\b/],
    ["a Convex hook", /\b(useQuery|useMutation|useAction|usePaginatedQuery|useConvex)\b/],
    ["a Convex client call", /\b(ConvexHttpClient|fetchQuery|fetchMutation|fetchAction)\b/],
    ["storage", /\b(localStorage|sessionStorage|indexedDB|caches)\b|document\.cookie/],
    ["logging", /\bconsole\.\w+\(/],
    ["a URL built from a position", /\b(lat|lng|latitude|longitude)=|[?&]near=/],
  ];

  it.each(forbidden)("does not use %s", (_label, pattern) => {
    const offenders = files
      .filter((file) => {
        const base = path.basename(file);
        // The container gets the Convex client for convex-data.ts to call; it calls nothing itself.
        if (base === "walk-container.tsx" && pattern.source.includes("useConvex")) return false;
        return pattern.test(readFileSync(file, "utf8"));
      })
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("calls Noren only from convex-data.ts, and with the region alone", () => {
    const callers = files.filter((file) =>
      /\.(query|mutation|action)\(/.test(readFileSync(file, "utf8")),
    );
    expect(callers.map((file) => path.basename(file))).toEqual(["convex-data.ts"]);
    const text = readFileSync(callers[0]!, "utf8");
    const calls = text.match(/client\.(query|mutation)\([^)]*\)/g) ?? [];
    expect(calls).toEqual([
      "client.query(api.walk.forRegion, { regionId })",
      "client.mutation(api.connector.omikujiToday, { regionId })",
    ]);
  });

  it("keeps the Convex side as narrow: the download and the draw take the region only", () => {
    const walkQuery = readFileSync(path.join(ROOT, "convex/walk.ts"), "utf8");
    expect(walkQuery).toMatch(
      /export const forRegion = query\(\{\s*args: \{ regionId: v\.string\(\) \}/,
    );
    const connector = readFileSync(path.join(ROOT, "convex/connector.ts"), "utf8");
    expect(connector).toMatch(
      /export const omikujiToday = mutation\(\{\s*args: \{ regionId: v\.string\(\) \}/,
    );
  });
});
