import { describe, expect, it } from "vitest";
import {
  KEPT_KEY,
  KEPT_MAX,
  clearKept,
  keepSlip,
  loadKept,
  markOpened,
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
