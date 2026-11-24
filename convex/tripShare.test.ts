/// <reference types="vite/client" />
import { anyApi, type ApiFromModules } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPostcardCode } from "../src/lib/postcard/rules";
import { addPerson, addPlace, errorCode, newBackend } from "../tests/convex/fixtures";
import * as region from "./lib/region";

const modules = import.meta.glob("./**/*.ts");
const { tripShare } = anyApi as unknown as ApiFromModules<{
  tripShare: typeof import("./tripShare");
}>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup() {
  const mode = vi.spyOn(region, "tripSwitch").mockReturnValue("open");
  const b = newBackend(modules);
  const owner = await addPerson(b, "organiser", "user");
  const other = await addPerson(b, "other", "user");
  const placeId = await addPlace(b, { createdBy: other, visibility: "public" });
  const input = {
    deviceTripId: "device-trip-1",
    title: "Our weekend",
    days: [
      {
        index: 1,
        items: [
          {
            kind: "stop" as const,
            at: "10:00",
            minutes: 20,
            placeId,
            turnLabel: "Auntie",
            checks: [
              { rule: "step-free", verdict: "not_known" as const, reason: "no_record" as const },
            ],
          },
          { kind: "stop" as const, at: "11:00", minutes: 10, pinLabel: "Meet here", checks: [] },
        ],
      },
    ],
  };
  const caller = b.as("organiser");
  const create = () => caller.mutation(tripShare.create, input);
  const read = (code: string) => b.t.query(tripShare.read, { code });
  const removing = (code: string) => caller.mutation(tripShare.remove, { code });
  return { b, mode, owner, other, placeId, caller, input, create, read, removing };
}

describe("private trip links", () => {
  it("stores only the share copy and is readable by code in trial", async () => {
    const { b, mode, owner, input, create, read } = await setup();
    const { code } = await create();
    expect(code).toHaveLength(24);
    expect(isPostcardCode(code)).toBe(true);
    const [row] = await b.run((ctx) => ctx.db.query("tripShare").take(2));
    expect(row).toEqual({
      ...input,
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      code,
      ownerPersonId: owner,
      regionId: "nagasaki",
    });
    mode.mockReturnValue("trial");
    const result = await read(code);
    expect(result).toEqual({
      title: input.title,
      regionId: "nagasaki",
      days: input.days,
      stops: [expect.objectContaining({ placeId: input.days[0]?.items[0]?.placeId })],
    });
    expect(await errorCode(create())).toBe("not_found");
  });

  it("rejects extra fields, missing stop targets and out-of-bounds shares", async () => {
    const { caller, input } = await setup();
    await expect(
      caller.mutation(tripShare.create, {
        ...input,
        days: [
          {
            index: 1,
            items: [
              {
                kind: "stop",
                at: "10:00",
                minutes: 10,
                pinLabel: "Meet here",
                checks: [],
                // @ts-expect-error Test a caller sending forbidden fields at runtime.
                travellerKey: "private-rule-owner",
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow();
    await expect(
      caller.mutation(tripShare.create, {
        ...input,
        days: [
          {
            index: 1,
            items: [
              {
                kind: "stop",
                at: "10:00",
                minutes: 10,
                checks: [],
                placeId: "bad-place",
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_input" } });
    for (const invalid of [
      { ...input, title: "X".repeat(81) },
      { ...input, days: Array(8).fill(input.days[0]) },
      { ...input, days: [{ index: 1, items: Array(13).fill(input.days[0]?.items[0]) }] },
    ]) {
      expect(await errorCode(caller.mutation(tripShare.create, invalid))).toBe("invalid_input");
    }
  });

  it("drops a withdrawn quote and then drops its place on the next read", async () => {
    const { b, other, placeId, create, read } = await setup();
    const storyId = await b.run((ctx) =>
      ctx.db.insert("story", {
        placeId,
        authorPersonId: other,
        body: "The morning light came in.",
        lang: "en",
        status: "live",
        isMock: false,
      }),
    );
    const { code } = await create();
    expect((await read(code))?.stops[0]?.quotes).toMatchObject([{ storyId }]);
    await b.run((ctx) => ctx.db.patch("story", storyId, { status: "hidden" }));
    expect((await read(code))?.stops[0]?.quotes).toEqual([]);
    await b.run((ctx) => ctx.db.patch("place", placeId, { visibility: "draft" }));
    const after = await read(code);
    expect(after?.stops).toEqual([]);
    expect(after?.days[0]?.items).toMatchObject([{ pinLabel: "Meet here" }]);
  });

  it("shows a met check only while its public report supports it", async () => {
    const { b, caller, other, input, read } = await setup();
    const regionId = "malaysia-west";
    vi.stubEnv("REGIONS_PREVIEW", regionId);
    const placeId = await addPlace(b, { createdBy: other, visibility: "public", regionId });
    const factId = await b.run((ctx) =>
      ctx.db.insert("placeFact", {
        placeId,
        regionId,
        key: "level_entrance",
        basis: "member",
        personId: other,
        value: "yes",
        day: "2026-11-24",
        isMock: false,
        status: "live",
      }),
    );
    const check = {
      rule: "step-free",
      verdict: "met",
      restsOn: { kind: "member", factId },
    } as const;
    const { code } = await caller.mutation(tripShare.create, {
      ...input,
      days: [
        { index: 1, items: [{ kind: "stop", at: "10:00", minutes: 20, placeId, checks: [check] }] },
      ],
    });
    expect(await read(code)).toMatchObject({
      regionId,
      days: [{ items: [{ checks: [check] }] }],
      stops: [{ facts: [{ factId, reporterName: "Test Person (other)", day: "2026-11-24" }] }],
    });
    await b.run((ctx) => ctx.db.patch("placeFact", factId, { status: "removed" }));
    expect(await read(code)).toMatchObject({
      days: [{ items: [{ checks: [{ rule: "step-free", verdict: "not_known" }] }] }],
      stops: [{ facts: [] }],
    });
  });

  it("hides unknown codes, disabled links and links with no owner", async () => {
    const { b, mode, owner, create, read } = await setup();
    const { code } = await create();
    expect(await read("2".repeat(24))).toBeNull();
    expect(await read("invalid")).toBeNull();
    mode.mockReturnValue("off");
    expect(await read(code)).toBeNull();
    mode.mockReturnValue("open");
    await b.run((ctx) => ctx.db.delete("person", owner));
    expect(await read(code)).toBeNull();
  });

  it("replaces a trip's old link and lets only its owner remove it", async () => {
    const { b, mode, create, read, removing } = await setup();
    const first = await create();
    const second = await create();
    expect(second.code).not.toBe(first.code);
    expect(await read(first.code)).toBeNull();
    expect(await read(second.code)).not.toBeNull();
    expect(await errorCode(b.as("other").mutation(tripShare.remove, second))).toBe("not_found");
    mode.mockReturnValue("off");
    expect(await errorCode(removing(second.code))).toBe("not_found");
    mode.mockReturnValue("open");
    await removing(second.code);
    expect(await read(second.code)).toBeNull();
    expect(await b.run((ctx) => ctx.db.query("tripShare").take(2))).toEqual([]);
  });

  it("allows 20 creations or replacements per person per day", async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 10, 24);
    vi.setSystemTime(now);
    const { b, input, create, read } = await setup();
    let code = "";
    for (let i = 0; i < 20; i++) ({ code } = await create());
    expect(await errorCode(create())).toBe("rate_limited");
    expect(await read(code)).not.toBeNull();
    await b.as("other").mutation(tripShare.create, input);
    vi.setSystemTime(now + 86_401_000);
    await create();
  });

  it("keeps up to 50 links, with replacement still allowed when full", async () => {
    const { b, owner, caller, input, create } = await setup();
    await b.run(async (ctx) => {
      for (let i = 0; i < 49; i++) {
        await ctx.db.insert("tripShare", {
          ...input,
          code: `fixture-${i}`,
          ownerPersonId: owner,
          regionId: "nagasaki",
          deviceTripId: `fixture-${i}`,
        });
      }
    });
    await create();
    expect(
      await errorCode(
        caller.mutation(tripShare.create, {
          ...input,
          deviceTripId: "too-many",
        }),
      ),
    ).toBe("conflict");
    await create();
    expect(await b.run((ctx) => ctx.db.query("tripShare").take(51))).toHaveLength(50);
  });
});
