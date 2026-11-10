import { describe, expect, it } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import { resolveAvoid, resolveInterests } from "@/lib/draw";
import {
  DAY_MS,
  JAPAN_UTC_OFFSET_HOURS,
  MAX_RULES,
  MAX_TASTES,
  MEMORY_STORAGE_KEY,
  OPEN_WEIGHT,
  RULE_PRESETS,
  SAVE_WEIGHT,
  TASTE_COUNTS_AT,
  TASTE_FORGOTTEN_BELOW,
  TASTE_HALF_LIFE_DAYS,
  TASTE_PRESETS,
  TASTES_OF_CATEGORY,
  TASTES_SENT,
  addRule,
  addTaste,
  addVisited,
  applyProposal,
  browserStorage,
  createMemoryStore,
  declineProposal,
  decayed,
  emptyMemory,
  forgetEverything,
  learn,
  parseMemory,
  proposalHasEffect,
  relevantProposals,
  removeRule,
  removeTaste,
  removeVisited,
  rollTrip,
  ruleFromText,
  serialiseMemory,
  setKept,
  snapshotOf,
  tasteFromText,
  tastesNow,
  tidy,
  type Clock,
  type KeyValueStore,
  type Memory,
  type Proposal,
} from "@/lib/memory";
import { regionSchema } from "@/lib/region/schema";

const region = regionSchema.parse(nagasaki);
// 2026-11-10 12:00 in Japan.
const NOON = Date.UTC(2026, 10, 10, 3, 0, 0);
const at = (now: number): Clock => ({ now, utcOffsetHours: JAPAN_UTC_OFFSET_HOURS });
const noon = at(NOON);
const days = (n: number) => n * DAY_MS;

function proposal(over: Partial<Proposal>): Proposal {
  return {
    id: "p1",
    op: "add",
    kind: "rule",
    text: "vegetarian",
    saidAs: "I'm vegetarian",
    ...over,
  };
}

describe("the decay of noticed tastes", () => {
  it("halves every TASTE_HALF_LIFE_DAYS and uses a named constant for it", () => {
    expect(TASTE_HALF_LIFE_DAYS).toBe(21);
    expect(decayed(4, 0)).toBe(4);
    expect(decayed(4, days(TASTE_HALF_LIFE_DAYS))).toBeCloseTo(2, 10);
    expect(decayed(4, days(2 * TASTE_HALF_LIFE_DAYS))).toBeCloseTo(1, 10);
    // A clock that went backwards does not make a taste stronger.
    expect(decayed(4, -days(5))).toBe(4);
  });

  it("an open adds OPEN_WEIGHT and a save adds SAVE_WEIGHT to the category's taste", () => {
    let memory = learn(emptyMemory(noon), { category: "cafe", action: "open" }, noon);
    expect(memory.tastes).toEqual([
      expect.objectContaining({ key: "coffee", told: false, strength: OPEN_WEIGHT }),
    ]);
    memory = learn(memory, { category: "cafe", action: "save" }, noon);
    expect(memory.tastes[0]!.strength).toBe(OPEN_WEIGHT + SAVE_WEIGHT);
  });

  it("one open is not yet a taste; a save, or two opens close together, is", () => {
    const one = learn(emptyMemory(noon), { category: "museum", action: "open" }, noon);
    expect(tastesNow(one, NOON)).toEqual([]);
    const two = learn(one, { category: "museum", action: "open" }, noon);
    expect(tastesNow(two, NOON).map((t) => t.key)).toEqual(["history"]);
    const saved = learn(emptyMemory(noon), { category: "museum", action: "save" }, noon);
    expect(tastesNow(saved, NOON).map((t) => t.key)).toEqual(["history"]);
  });

  it("a noticed taste fades out of use, then out of the device", () => {
    const memory = learn(emptyMemory(noon), { category: "museum", action: "save" }, noon);
    // A save is 3. After one half-life it is 1.5, which still counts; a little later it does not.
    expect(tastesNow(memory, NOON + days(TASTE_HALF_LIFE_DAYS)).length).toBe(1);
    expect(tastesNow(memory, NOON + days(TASTE_HALF_LIFE_DAYS + 1)).length).toBe(0);
    // Not forgotten yet: opening again picks it back up from what is left.
    expect(tidy(memory, at(NOON + days(40))).tastes.length).toBe(1);
    // Forgotten below TASTE_FORGOTTEN_BELOW (3 -> 0.2 takes about 82 days).
    const later = at(NOON + days(90));
    expect(3 * 0.5 ** (90 / TASTE_HALF_LIFE_DAYS)).toBeLessThan(TASTE_FORGOTTEN_BELOW);
    expect(tidy(memory, later).tastes).toEqual([]);
  });

  it("opening again adds to what is left after fading, not to the old strength", () => {
    const first = learn(emptyMemory(noon), { category: "cafe", action: "save" }, noon);
    const later = at(NOON + days(TASTE_HALF_LIFE_DAYS));
    const again = learn(first, { category: "cafe", action: "open" }, later);
    expect(again.tastes[0]!.strength).toBeCloseTo(3 / 2 + OPEN_WEIGHT, 10);
    expect(again.tastes[0]!.updatedAt).toBe(later.now);
  });

  it("an attraction points at history and nature and splits the weight", () => {
    const memory = learn(emptyMemory(noon), { category: "attraction", action: "save" }, noon);
    expect(memory.tastes.map((t) => [t.key, t.strength])).toEqual([
      ["history", SAVE_WEIGHT / 2],
      ["nature", SAVE_WEIGHT / 2],
    ]);
  });

  it("a category with no taste, or none at all, changes nothing", () => {
    const memory = emptyMemory(noon);
    expect(learn(memory, { category: "other", action: "open" }, noon)).toBe(memory);
    expect(learn(memory, { category: undefined, action: "save" }, noon)).toBe(memory);
  });

  it("a taste the visitor told does not fade and is not changed by browsing", () => {
    let memory = addTaste(emptyMemory(noon), "coffee", noon);
    expect(memory.tastes[0]).toMatchObject({ key: "coffee", told: true });
    const browsed = learn(memory, { category: "cafe", action: "save" }, noon);
    expect(browsed).toBe(memory);
    memory = tidy(memory, at(NOON + days(400)));
    expect(tastesNow(memory, NOON + days(400)).map((t) => t.key)).toEqual(["coffee"]);
  });

  it("telling Noren a taste it had noticed makes it a told one", () => {
    let memory = learn(emptyMemory(noon), { category: "cafe", action: "open" }, noon);
    memory = addTaste(memory, "Coffee", noon);
    expect(memory.tastes).toHaveLength(1);
    expect(memory.tastes[0]!.told).toBe(true);
  });

  it("puts told tastes first and sends only the top few", () => {
    let memory = emptyMemory(noon);
    for (const category of ["museum", "cafe", "bar", "shop"]) {
      memory = learn(memory, { category, action: "save" }, noon);
    }
    memory = addTaste(memory, "music", noon);
    const snapshot = snapshotOf(memory, noon);
    expect(snapshot.interests).toHaveLength(TASTES_SENT);
    expect(snapshot.interests[0]).toBe("music");
  });

  it("keeps at most MAX_TASTES, dropping the weakest noticed ones first", () => {
    let memory = emptyMemory(noon);
    for (let n = 0; n < MAX_TASTES + 4; n++) {
      memory = {
        ...memory,
        tastes: [
          ...memory.tastes,
          { key: `t${n}`, label: `t${n}`, told: false, strength: 2 + n / 100, updatedAt: NOON },
        ],
      };
    }
    memory = learn(memory, { category: "cafe", action: "save" }, noon);
    expect(memory.tastes.length).toBeLessThanOrEqual(MAX_TASTES);
    expect(memory.tastes.some((t) => t.key === "coffee")).toBe(true);
    expect(memory.tastes.some((t) => t.key === "t0")).toBe(false);
  });

  it("removes a taste", () => {
    const memory = addTaste(emptyMemory(noon), "history", noon);
    expect(removeTaste(memory, "history").tastes).toEqual([]);
    expect(removeTaste(memory, "nothing")).toBe(memory);
  });

  it("every taste the page offers is one the draw understands, and every category taste is on the page", () => {
    for (const preset of TASTE_PRESETS) {
      expect(resolveInterests([preset.key], region).unmatched, preset.key).toEqual([]);
    }
    const offered = new Set(TASTE_PRESETS.map((preset) => preset.key));
    for (const keys of Object.values(TASTES_OF_CATEGORY)) {
      for (const key of keys) expect(offered.has(key), key).toBe(true);
    }
    for (const category of Object.keys(TASTES_OF_CATEGORY)) {
      expect(
        region.categories?.some((c) => c.key === category),
        category,
      ).toBe(true);
    }
  });

  it("the counting threshold is the one the tests above assume", () => {
    expect(TASTE_COUNTS_AT).toBe(1.5);
  });
});

describe("hard rules", () => {
  it("never fade", () => {
    let memory = addRule(emptyMemory(noon), "vegetarian");
    memory = addRule(memory, "allergic to peanuts");
    const tenYearsOn = at(NOON + days(3650));
    expect(tidy(memory, tenYearsOn).rules).toEqual(memory.rules);
    expect(snapshotOf(memory, tenYearsOn).avoid).toEqual(["vegetarian", "allergy:peanuts"]);
  });

  it("understand the presets in English and Japanese, and allergies by name", () => {
    expect(ruleFromText("Vegetarian")).toMatchObject({ kind: "diet", tag: "vegetarian" });
    expect(ruleFromText("I'm vegan")).toMatchObject({ tag: "vegan" });
    expect(ruleFromText("no pork")).toMatchObject({ tag: "pork-free" });
    expect(ruleFromText("豚肉なし")).toMatchObject({ tag: "pork-free" });
    expect(ruleFromText("no alcohol")).toMatchObject({ tag: "no-alcohol" });
    expect(ruleFromText("step-free")).toMatchObject({ kind: "mobility", tag: "step-free" });
    expect(ruleFromText("short walks")).toMatchObject({ kind: "mobility" });
    expect(ruleFromText("low budget")).toMatchObject({ kind: "budget" });
    expect(ruleFromText("allergic to peanuts")).toEqual({
      kind: "allergy",
      tag: "allergy:peanuts",
      label: "peanuts",
    });
    expect(ruleFromText("shellfish allergy")).toMatchObject({
      kind: "allergy",
      label: "shellfish",
    });
    expect(ruleFromText("そばアレルギー")).toMatchObject({ kind: "allergy", label: "そば" });
    expect(ruleFromText("no spicy food")).toMatchObject({ kind: "other", tag: "no-spicy-food" });
  });

  it("refuse a blank or overlong phrase", () => {
    expect(ruleFromText("   ")).toBeNull();
    expect(ruleFromText("x".repeat(200))).toBeNull();
    const memory = emptyMemory(noon);
    expect(addRule(memory, "")).toBe(memory);
  });

  it("are not added twice, are capped, and can be removed", () => {
    let memory = addRule(emptyMemory(noon), "vegetarian");
    expect(addRule(memory, "veggie")).toBe(memory);
    const [rule] = memory.rules;
    expect(removeRule(memory, rule!.id).rules).toEqual([]);
    expect(removeRule(memory, "nope")).toBe(memory);
    for (let n = 0; n < MAX_RULES + 3; n++) memory = addRule(memory, `no thing ${n}`);
    expect(memory.rules).toHaveLength(MAX_RULES);
  });

  it("every preset rule is either one the draw can check or one it will honestly say it cannot", () => {
    const checkable = new Set(["step-free", "no-alcohol"]);
    for (const preset of RULE_PRESETS) {
      const resolved = resolveAvoid([preset.tag], region);
      if (checkable.has(preset.tag)) {
        expect(
          resolved.applied.map((r) => r.tag),
          preset.tag,
        ).toEqual([preset.tag]);
      } else {
        expect(
          resolved.notChecked.map((r) => r.tag),
          preset.tag,
        ).toEqual([preset.tag]);
      }
    }
    // An allergy by name has no data behind it either.
    expect(resolveAvoid(["allergy:peanuts"], region).notChecked).toHaveLength(1);
  });
});

describe("today's trip", () => {
  const evening = at(Date.UTC(2026, 10, 10, 14, 59, 0)); // 23:59 on the 10th in Japan
  const midnight = at(Date.UTC(2026, 10, 10, 15, 0, 0)); // 00:00 on the 11th in Japan

  it("is wiped at the end of the day in Japan, not at UTC midnight", () => {
    let memory = addVisited(emptyMemory(noon), { label: "Champon at lunch" }, noon);
    memory = addVisited(memory, { label: "Dejima", slug: "dejima" }, noon);
    expect(memory.trip.day).toBe("2026-11-10");
    // At 23:59 in Japan it is still the 10th, though it is already 14:59 in UTC.
    expect(rollTrip(memory, evening).trip.items).toHaveLength(2);
    const next = tidy(memory, midnight);
    expect(next.trip).toEqual({ day: "2026-11-11", items: [] });
  });

  it("keeps what the visitor chose to keep", () => {
    let memory = addVisited(emptyMemory(noon), { label: "Glover Garden", slug: "glover" }, noon);
    memory = addVisited(memory, { label: "Castella" }, noon);
    const [glover] = memory.trip.items;
    memory = setKept(memory, glover!.id, true);
    const next = tidy(memory, midnight);
    expect(next.trip.items.map((item) => item.label)).toEqual(["Glover Garden"]);
    expect(setKept(next, glover!.id, true)).toBe(next);
    expect(setKept(next, glover!.id, false).trip.items[0]!.kept).toBe(false);
  });

  it("adds by hand, not twice, with a limit, and removes", () => {
    let memory = addVisited(emptyMemory(noon), { label: "  Ramen  " }, noon);
    expect(memory.trip.items[0]!.label).toBe("Ramen");
    expect(addVisited(memory, { label: "ramen" }, noon)).toBe(memory);
    expect(addVisited(memory, { label: "   " }, noon)).toBe(memory);
    memory = addVisited(memory, { label: "Dejima", slug: "dejima" }, noon);
    expect(addVisited(memory, { label: "Dejima again", slug: "dejima" }, noon)).toBe(memory);
    const [first] = memory.trip.items;
    expect(removeVisited(memory, first!.id).trip.items).toHaveLength(1);
    expect(removeVisited(memory, "nope")).toBe(memory);
  });

  it("sends only labels and the slugs of known places", () => {
    let memory = addVisited(emptyMemory(noon), { label: "Champon" }, noon);
    memory = addVisited(memory, { label: "Dejima", slug: "dejima" }, noon);
    expect(snapshotOf(memory, noon).done).toEqual([
      { label: "Champon" },
      { label: "Dejima", slug: "dejima" },
    ]);
    // Yesterday's trip is not sent today even if nothing has tidied the memory yet.
    expect(snapshotOf(memory, midnight).done).toEqual([]);
  });
});

describe("proposals", () => {
  const memory = addRule(emptyMemory(noon), "vegetarian");

  it("change the memory only when the visitor says Yes", () => {
    const yes = applyProposal(emptyMemory(noon), proposal({}), noon);
    expect(yes.rules.map((r) => r.tag)).toEqual(["vegetarian"]);
    const start = emptyMemory(noon);
    // "No" is a no-op by construction: the very same object comes back.
    expect(declineProposal(start)).toBe(start);
  });

  it("add and remove each kind", () => {
    const base = emptyMemory(noon);
    const withTaste = applyProposal(base, proposal({ kind: "taste", text: "coffee" }), noon);
    expect(withTaste.tastes[0]).toMatchObject({ key: "coffee", told: true });
    expect(
      applyProposal(withTaste, proposal({ op: "remove", kind: "taste", text: "coffee" }), noon)
        .tastes,
    ).toEqual([]);
    expect(
      applyProposal(
        memory,
        proposal({ op: "remove", kind: "rule", text: "I am a vegetarian" }),
        noon,
      ).rules,
    ).toEqual([]);
    const withVisit = applyProposal(base, proposal({ kind: "visited", text: "Champon" }), noon);
    expect(withVisit.trip.items.map((i) => i.label)).toEqual(["Champon"]);
    expect(
      applyProposal(withVisit, proposal({ op: "remove", kind: "visited", text: "champon" }), noon)
        .trip.items,
    ).toEqual([]);
  });

  it("are shown only when Yes would change something", () => {
    expect(proposalHasEffect(memory, proposal({}))).toBe(false); // already a rule
    expect(proposalHasEffect(memory, proposal({ text: "vegan" }))).toBe(true);
    expect(proposalHasEffect(memory, proposal({ op: "remove", text: "vegan" }))).toBe(false);
    expect(proposalHasEffect(memory, proposal({ op: "remove" }))).toBe(true);
    expect(proposalHasEffect(memory, proposal({ kind: "taste", text: "coffee" }))).toBe(true);
    expect(
      proposalHasEffect(memory, proposal({ op: "remove", kind: "taste", text: "coffee" })),
    ).toBe(false);
    expect(proposalHasEffect(memory, proposal({ text: "   " }))).toBe(false);
    expect(
      relevantProposals(memory, [proposal({}), proposal({ id: "p2", text: "halal" })]).map(
        (p) => p.id,
      ),
    ).toEqual(["p2"]);
  });

  it("do not fill a full rule list", () => {
    let full = emptyMemory(noon);
    for (let n = 0; n < MAX_RULES; n++) full = addRule(full, `no thing ${n}`);
    expect(proposalHasEffect(full, proposal({ text: "halal" }))).toBe(false);
    expect(applyProposal(full, proposal({ text: "halal" }), noon)).toBe(full);
  });

  it("applying a proposal a bad phrase makes does nothing", () => {
    expect(applyProposal(memory, proposal({ text: "" }), noon)).toBe(memory);
    expect(applyProposal(memory, proposal({ kind: "taste", text: "" }), noon)).toBe(memory);
  });
});

describe("tasteFromText", () => {
  it("knows the presets in both languages and keeps anything else as the visitor's own word", () => {
    expect(tasteFromText("Coffee")).toEqual({ key: "coffee", label: "Coffee" });
    expect(tasteFromText("歴史")).toEqual({ key: "history", label: "History" });
    expect(tasteFromText("ramen")).toEqual({ key: "ramen", label: "ramen" });
    expect(tasteFromText("")).toBeNull();
  });
});

describe("parsing what the device holds", () => {
  it("round-trips", () => {
    let memory = addRule(emptyMemory(noon), "halal");
    memory = addTaste(memory, "history", noon);
    memory = addVisited(memory, { label: "Dejima", slug: "dejima" }, noon);
    expect(parseMemory(serialiseMemory(memory), noon)).toEqual(memory);
  });

  it("gives an empty memory for nothing, for junk and for another version", () => {
    for (const raw of [null, "", "not json", "[]", "null", '{"version":2}']) {
      expect(parseMemory(raw, noon)).toEqual(emptyMemory(noon));
    }
  });

  it("drops a damaged entry and keeps the others", () => {
    const raw = JSON.stringify({
      version: 1,
      rules: [{ id: "diet:halal", kind: "diet", tag: "halal", label: "Halal" }, { nope: true }],
      tastes: "broken",
      trip: { day: "not a day", items: [{ id: "a", label: "Old", addedAt: 1, kept: false }] },
    });
    const memory = parseMemory(raw, noon);
    expect(memory.rules.map((r) => r.tag)).toEqual(["halal"]);
    expect(memory.tastes).toEqual([]);
    // A trip with no readable day belongs to no day, so it is wiped.
    expect(memory.trip.items).toEqual([]);
  });

  it("tidies as it reads: yesterday's trip goes and faded tastes go", () => {
    let memory = addVisited(emptyMemory(noon), { label: "Champon" }, noon);
    memory = learn(memory, { category: "cafe", action: "open" }, noon);
    const raw = serialiseMemory(memory);
    const later = parseMemory(raw, at(NOON + days(100)));
    expect(later.trip.items).toEqual([]);
    expect(later.tastes).toEqual([]);
  });
});

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: KeyValueStore & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
  return storage;
}

describe("the on-device store", () => {
  it("reads on first use, saves every change, tells listeners and returns a stable snapshot", () => {
    const storage = fakeStorage();
    let clock = noon;
    const store = createMemoryStore({ storage: () => storage, clock: () => clock });
    const seen: Memory[] = [];
    const stop = store.subscribe(() => seen.push(store.get()));
    expect(store.get()).toBe(store.get());
    store.update((memory) => addRule(memory, "vegan"));
    expect(seen).toHaveLength(1);
    expect(JSON.parse(storage.data.get(MEMORY_STORAGE_KEY)!).rules[0].tag).toBe("vegan");
    // A change that changes nothing saves nothing and tells nobody.
    store.update((memory) => memory);
    expect(seen).toHaveLength(1);
    stop();
    clock = noon;
    store.update((memory) => addRule(memory, "halal"));
    expect(seen).toHaveLength(1);
  });

  it("picks up a change another tab made, and a day that turned", () => {
    const storage = fakeStorage();
    let clock = noon;
    const store = createMemoryStore({ storage: () => storage, clock: () => clock });
    store.update((memory) => addVisited(memory, { label: "Champon" }, clock));
    storage.setItem(MEMORY_STORAGE_KEY, serialiseMemory(addRule(store.get(), "vegetarian")));
    store.reload();
    expect(store.get().rules.map((r) => r.tag)).toEqual(["vegetarian"]);
    clock = at(Date.UTC(2026, 10, 10, 15, 0, 0));
    store.reload();
    expect(store.get().trip.items).toEqual([]);
    expect(JSON.parse(storage.data.get(MEMORY_STORAGE_KEY)!).trip.items).toEqual([]);
  });

  it("forget everything empties the memory and the device", () => {
    const storage = fakeStorage();
    const store = createMemoryStore({ storage: () => storage, clock: () => noon });
    store.update((memory) => addTaste(addRule(memory, "halal"), "history", noon));
    store.forgetAll();
    expect(store.get()).toEqual(forgetEverything(noon));
    expect(storage.data.has(MEMORY_STORAGE_KEY)).toBe(false);
  });

  it("works when the device will not keep anything, and says so", () => {
    const store = createMemoryStore({ storage: () => null, clock: () => noon });
    store.update((memory) => addRule(memory, "halal"));
    expect(store.get().rules).toHaveLength(1);
    expect(store.canKeep()).toBe(false);
    store.forgetAll();
    expect(store.get().rules).toEqual([]);
  });

  it("survives storage that throws on every call", () => {
    const hostile: KeyValueStore = {
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
    const store = createMemoryStore({ storage: () => hostile, clock: () => noon });
    expect(store.get()).toEqual(emptyMemory(noon));
    store.update((memory) => addRule(memory, "halal"));
    expect(store.get().rules).toHaveLength(1);
    expect(store.canKeep()).toBe(false);
    expect(() => store.forgetAll()).not.toThrow();
    expect(() => store.reload()).not.toThrow();
  });
});

describe("browserStorage", () => {
  it("is null where local storage is missing or throws, and the storage where it works", () => {
    expect(browserStorage(() => undefined)).toBeNull();
    expect(
      browserStorage(() => {
        throw new Error("SecurityError");
      }),
    ).toBeNull();
    const broken = {
      setItem() {
        throw new Error("QuotaExceededError");
      },
      removeItem() {},
    } as unknown as Storage;
    expect(browserStorage(() => broken)).toBeNull();
    const working = fakeStorage();
    expect(browserStorage(() => working as unknown as Storage)).toBe(working);
    expect(working.data.size).toBe(0);
  });
});
