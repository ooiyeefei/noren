import { describe, expect, it } from "vitest";
import {
  KEPT_KEY,
  KEPT_MAX,
  clearKept,
  doorsOf,
  isTied,
  keepSlip,
  loadKept,
  markOpened,
  openDoor,
  saveKept,
  type KeptSlip,
  type StoragePort,
} from "@/lib/slip/kept";
import { checkDoor, knockAtDoor } from "@/lib/slip/door";
import { SLIP_OPEN_METRES } from "@/lib/walk/constants";
import type { Slip } from "@/lib/walk/types";
import { ORIGIN, fixAt, northOf } from "../fixtures/walk";

const slip = (slug = "a"): Slip => ({
  place: { slug, names: [], hasStory: false, pin: ORIGIN },
  question: { kind: "starter", key: "oldest" },
});
const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;

function memory(): StoragePort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
const broken: StoragePort = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("kept slips", () => {
  it("round-trip through storage under one key", () => {
    const port = memory();
    const list = keepSlip([], { day: day(10), neighbourhoodId: "suwa", slip: slip() });
    expect(saveKept(port, list)).toBe(true);
    expect([...port.data.keys()]).toEqual([KEPT_KEY]);
    expect(KEPT_KEY).toBe("noren.slips.v1");
    expect(loadKept(port)).toEqual(list);
  });

  it("replace the same day and neighbourhood, and an open seal stays open", () => {
    let list = keepSlip([], { day: day(10), neighbourhoodId: null, slip: slip("a") });
    list = markOpened(list, { day: day(10), neighbourhoodId: null });
    list = keepSlip(list, { day: day(10), neighbourhoodId: null, slip: slip("b") });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ opened: true, slip: { place: { slug: "b" } } });
  });

  it("keep at most seven, newest first, and an old unopened one stays until pushed out", () => {
    let list: KeptSlip[] = keepSlip([], { day: day(1), neighbourhoodId: null, slip: slip() });
    expect(list[0]!.opened).toBe(false);
    for (let d = 2; d <= 7; d++)
      list = keepSlip(list, { day: day(d), neighbourhoodId: null, slip: slip() });
    expect(list.map((k) => k.day)).toEqual([7, 6, 5, 4, 3, 2, 1].map(day));
    list = keepSlip(list, { day: day(8), neighbourhoodId: null, slip: slip() });
    expect(list).toHaveLength(KEPT_MAX);
    expect(list.map((k) => k.day)).not.toContain(day(1));
  });

  it("marks only the chosen one as opened", () => {
    let list = keepSlip([], { day: day(9), neighbourhoodId: "a", slip: slip() });
    list = keepSlip(list, { day: day(10), neighbourhoodId: "a", slip: slip() });
    list = markOpened(list, { day: day(9), neighbourhoodId: "a" });
    expect(list.map((k) => [k.day, k.opened])).toEqual([
      [day(10), false],
      [day(9), true],
    ]);
  });

  it("ignore junk in storage", () => {
    const port = memory();
    port.setItem(KEPT_KEY, "{not json");
    expect(loadKept(port)).toEqual([]);
    port.setItem(KEPT_KEY, JSON.stringify([{ day: 1 }, null, "x"]));
    expect(loadKept(port)).toEqual([]);
  });

  it("are cleared from storage", () => {
    const port = memory();
    saveKept(port, keepSlip([], { day: day(10), neighbourhoodId: null, slip: slip() }));
    expect(clearKept(port)).toBe(true);
    expect(loadKept(port)).toEqual([]);
  });

  it("never throw when storage is missing or refuses", () => {
    expect(loadKept(null)).toEqual([]);
    expect(loadKept(broken)).toEqual([]);
    expect(saveKept(null, [])).toBe(false);
    expect(saveKept(broken, [])).toBe(false);
    expect(clearKept(broken)).toBe(false);
    expect(clearKept(null)).toBe(false);
  });
});

describe("the door", () => {
  it("opens within the radius and says how far otherwise", () => {
    expect(SLIP_OPEN_METRES).toBe(60);
    expect(checkDoor(fixAt(northOf(ORIGIN, 50), 5), ORIGIN, 30)).toEqual({ kind: "open" });
    const far = checkDoor(fixAt(northOf(ORIGIN, 400), 5), ORIGIN, 30);
    expect(far).toMatchObject({ kind: "far" });
    expect((far as { metres: number }).metres).toBeGreaterThan(380);
  });
  it("lets a good reading count a little closer, by the allowance only", () => {
    expect(checkDoor(fixAt(northOf(ORIGIN, 85), 30), ORIGIN, 30).kind).toBe("open");
    expect(checkDoor(fixAt(northOf(ORIGIN, 85), 30), ORIGIN, 0).kind).toBe("far");
  });
  it("trusts no rough reading, even one on the pin", () => {
    expect(checkDoor(fixAt(ORIGIN, 250), ORIGIN, 30)).toEqual({ kind: "rough", accuracy: 250 });
  });
  it("takes one reading on a knock, and says none when it cannot", async () => {
    const locate = async () => ({ kind: "read" as const, ...fixAt(ORIGIN, 8) });
    expect(await knockAtDoor(locate, ORIGIN, 30)).toEqual({ kind: "open" });
    expect(await knockAtDoor(async () => ({ kind: "denied" }), ORIGIN, 30)).toEqual({
      kind: "none",
    });
  });
});

// Three doors: a kept slip remembers how many of its two further doors are open, in order.
describe("kept slips and their further doors", () => {
  const stop = (slug: string, via: "draw" | "carried" = "draw") => ({
    via,
    ...(via === "carried" ? { carried: { askedBy: "Kenji", from: { slug: "a", names: [] } } } : {}),
    place: { slug, names: [], hasStory: false, pin: ORIGIN },
    question: { kind: "starter" as const, key: "oldest" },
  });
  const threaded = (slug = "a"): Slip =>
    ({ ...slip(slug), thread: [stop("two"), stop("three", "carried")] }) as Slip;
  const key = { day: day(10), neighbourhoodId: "suwa" };
  const opened = () => markOpened(keepSlip([], { ...key, slip: threaded() }), key);

  it("start with none open, and a slip kept before the field existed reads as none", () => {
    const list = keepSlip([], { ...key, slip: threaded() });
    expect(list[0]).not.toHaveProperty("doors");
    expect(doorsOf(list[0]!)).toBe(0);
    const port = memory();
    port.setItem(
      KEPT_KEY,
      JSON.stringify([{ day: day(9), neighbourhoodId: null, opened: true, slip: slip() }]),
    );
    const [old] = loadKept(port);
    expect(old).toMatchObject({ opened: true });
    expect(doorsOf(old!)).toBe(0);
    expect(isTied(old!)).toBe(false);
  });

  it("open one after the other, and only once the slip's own seal is open", () => {
    let list = keepSlip([], { ...key, slip: threaded() });
    expect(openDoor(list, key, 1)).toEqual(list);
    list = markOpened(list, key);
    expect(openDoor(list, key, 2)).toEqual(list);
    list = openDoor(list, key, 1);
    expect(doorsOf(list[0]!)).toBe(1);
    expect(isTied(list[0]!)).toBe(false);
    expect(openDoor(list, key, 1)).toEqual(list);
    list = openDoor(list, key, 2);
    expect(doorsOf(list[0]!)).toBe(2);
    expect(isTied(list[0]!)).toBe(true);
    expect(openDoor(list, key, 3)).toEqual(list);
  });

  it("touch only the slip asked about", () => {
    let list = keepSlip([], { ...key, slip: threaded() });
    list = keepSlip(list, { day: day(10), neighbourhoodId: null, slip: threaded("b") });
    list = markOpened(markOpened(list, key), { day: day(10), neighbourhoodId: null });
    list = openDoor(list, key, 1);
    expect(list.map((kept) => doorsOf(kept))).toEqual([0, 1]);
  });

  it("survive a round trip through storage", () => {
    const port = memory();
    let list = opened();
    list = openDoor(openDoor(list, key, 1), key, 2);
    saveKept(port, list);
    const [back] = loadKept(port);
    expect(doorsOf(back!)).toBe(2);
    expect(back!.slip.thread).toHaveLength(2);
  });

  it("keep the larger count when the same day's slip is drawn again", () => {
    let list = openDoor(opened(), key, 1);
    list = keepSlip(list, { ...key, slip: threaded() });
    expect(doorsOf(list[0]!)).toBe(1);
    list = openDoor(list, key, 2);
    list = keepSlip(list, { ...key, slip: threaded(), doors: 0 });
    expect(doorsOf(list[0]!)).toBe(2);
    list = keepSlip(list, { ...key, slip: threaded(), doors: 1 });
    expect(doorsOf(list[0]!)).toBe(2);
    list = keepSlip([], { ...key, slip: threaded(), doors: 2 });
    expect(doorsOf(list[0]!)).toBe(2);
  });

  it("keep the doors that were opened when the day's thread changes, and take the new ones before any is open", () => {
    const changed = (): Slip =>
      ({ ...slip(), thread: [stop("other-two"), stop("other-three")] }) as Slip;
    const slugs = (list: KeptSlip[]) => list[0]!.slip.thread!.map(({ place }) => place.slug);
    // Nothing further is open yet: the newly drawn thread replaces the kept one.
    let list = keepSlip(opened(), { ...key, slip: changed() });
    expect(slugs(list)).toEqual(["other-two", "other-three"]);
    // Door two is open: a later draw with other doors keeps the ones this person opened.
    list = openDoor(opened(), key, 1);
    list = keepSlip(list, { ...key, slip: changed() });
    expect(slugs(list)).toEqual(["two", "three"]);
    expect(doorsOf(list[0]!)).toBe(1);
    // And when the day's slip comes without a thread (the switch went off), the kept doors stay.
    list = keepSlip(list, { ...key, slip: slip() });
    expect(slugs(list)).toEqual(["two", "three"]);
  });

  it("never count more doors than the slip has", () => {
    const noThread = { ...slip(), thread: undefined } as Slip;
    expect(doorsOf({ doors: 2, slip: noThread })).toBe(0);
    expect(doorsOf({ doors: 9, slip: threaded() })).toBe(2);
    expect(doorsOf({ doors: -3, slip: threaded() })).toBe(0);
    expect(doorsOf({ doors: 1.9, slip: threaded() })).toBe(1);
    expect(doorsOf({ doors: Number.NaN, slip: threaded() })).toBe(0);
    expect(doorsOf({ doors: "2" as never, slip: threaded() })).toBe(0);
  });

  it("do not throw on what a damaged or edited store holds", () => {
    const port = memory();
    const bad = [
      { day: day(10), neighbourhoodId: null, opened: true, doors: "lots", slip: slip("a") },
      {
        day: day(9),
        neighbourhoodId: null,
        opened: true,
        doors: 7,
        slip: { ...slip("b"), thread: "no" },
      },
      {
        day: day(8),
        neighbourhoodId: null,
        opened: true,
        doors: 2,
        slip: { ...slip("c"), thread: [{ via: "draw" }, null] },
      },
      {
        day: day(7),
        neighbourhoodId: null,
        opened: true,
        doors: 2,
        slip: { ...slip("d"), thread: [stop("x"), stop("y")] },
      },
    ];
    port.setItem(KEPT_KEY, JSON.stringify(bad));
    const list = loadKept(port);
    expect(list).toHaveLength(4);
    expect(list.map((kept) => doorsOf(kept))).toEqual([0, 0, 0, 2]);
    expect(list.map((kept) => kept.slip.thread?.length)).toEqual([
      undefined,
      undefined,
      undefined,
      2,
    ]);
    expect(() => openDoor(list, key, Number.NaN)).not.toThrow();
    expect(() => openDoor([], key, 1)).not.toThrow();
    expect(openDoor(list, key, 1.5)).toEqual(list);
    expect(loadKept(broken)).toEqual([]);
  });
});
