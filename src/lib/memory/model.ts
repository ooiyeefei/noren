import { localDay } from "../draw/time";
import {
  DAY_MS,
  MAX_LABEL_LENGTH,
  MAX_RULES,
  MAX_TASTES,
  MAX_TRIP_ITEMS,
  MEMORY_VERSION,
  OPEN_WEIGHT,
  SAVE_WEIGHT,
  TASTE_COUNTS_AT,
  TASTE_FORGOTTEN_BELOW,
  TASTE_HALF_LIFE_DAYS,
  TASTE_STRENGTH_CAP,
  TASTES_SENT,
} from "./constants";
import {
  canon,
  ruleFromText,
  TASTE_PRESETS,
  tasteFromText,
  TASTES_OF_CATEGORY,
  type RuleKind,
} from "./vocabulary";

// What Noren remembers about a visitor, as plain data and pure functions. Nothing here touches the
// browser, the network or the clock: the caller says what time it is. Every change returns a new
// memory, or the very same object when nothing changed, so a screen can tell the difference.
//
// Three kinds, kept apart because they behave differently:
//   rules   hard rules (diet, allergies, mobility, budget). They never fade.
//   tastes  what the visitor likes. Ones they tell Noren stay until removed. Ones Noren notices from
//           what they open and save fade with a half-life (TASTE_HALF_LIFE_DAYS).
//   trip    what they did today. It is wiped at the end of the day in Japan, unless they keep it.

export type Rule = { id: string; kind: RuleKind; tag: string; label: string };
export type Taste = {
  key: string;
  label: string;
  /** The visitor said so. Told tastes do not fade. */
  told: boolean;
  /** Strength as of `updatedAt`; use `strengthAt` to read it now. */
  strength: number;
  updatedAt: number;
};
export type TripItem = {
  id: string;
  label: string;
  /** Set when the visitor picked a place Noren knows, so a draw can leave it out. */
  slug?: string;
  addedAt: number;
  kept: boolean;
};
export type Memory = {
  version: typeof MEMORY_VERSION;
  rules: Rule[];
  tastes: Taste[];
  trip: { day: string; items: TripItem[] };
};

/** The time, as the caller reads it. `utcOffsetHours` is the region's (9 for Japan). */
export type Clock = { now: number; utcOffsetHours: number };

export function emptyMemory(clock: Clock): Memory {
  return {
    version: MEMORY_VERSION,
    rules: [],
    tastes: [],
    trip: { day: localDay(clock.now, clock.utcOffsetHours), items: [] },
  };
}

export function isEmpty(memory: Memory): boolean {
  return memory.rules.length === 0 && memory.tastes.length === 0 && memory.trip.items.length === 0;
}

// ---------------------------------------------------------------------------------------------
// Tastes: the decay

/** Strength after `elapsedMs`: it halves every TASTE_HALF_LIFE_DAYS. */
export function decayed(strength: number, elapsedMs: number): number {
  const days = Math.max(0, elapsedMs) / DAY_MS;
  return strength * 0.5 ** (days / TASTE_HALF_LIFE_DAYS);
}

export function strengthAt(taste: Taste, now: number): number {
  return decayed(taste.strength, now - taste.updatedAt);
}

/** Whether a taste is strong enough to be used and shown. A told one always is. */
export function counts(taste: Taste, now: number): boolean {
  return taste.told || strengthAt(taste, now) >= TASTE_COUNTS_AT;
}

/**
 * The tastes in use, the ones the visitor told first and then the strongest noticed ones. This is the
 * order of the visitor's own interests, not a ranking of anything on the map.
 */
export function tastesNow(memory: Memory, now: number): Taste[] {
  return memory.tastes
    .filter((taste) => counts(taste, now))
    .map((taste) => ({ taste, strength: strengthAt(taste, now) }))
    .sort(
      (a, b) =>
        Number(b.taste.told) - Number(a.taste.told) ||
        b.strength - a.strength ||
        a.taste.key.localeCompare(b.taste.key),
    )
    .map(({ taste }) => taste);
}

/** The few tastes that go to the draw. */
export function topTastes(memory: Memory, now: number, limit = TASTES_SENT): Taste[] {
  return tastesNow(memory, now).slice(0, limit);
}

/**
 * A visitor opened or saved a place in this category. Each taste the category points to gains a share
 * of the weight on top of what it has left after fading. A told taste is left as it is.
 */
export function learn(
  memory: Memory,
  event: { category: string | undefined; action: "open" | "save" },
  clock: Clock,
): Memory {
  const keys = event.category === undefined ? undefined : TASTES_OF_CATEGORY[event.category];
  if (keys === undefined || keys.length === 0) return memory;
  const weight = (event.action === "save" ? SAVE_WEIGHT : OPEN_WEIGHT) / keys.length;
  let tastes = memory.tastes;
  for (const key of keys) {
    const existing = tastes.find((taste) => taste.key === key);
    if (existing?.told) continue;
    const label = TASTE_PRESETS.find((preset) => preset.key === key)?.label.en ?? key;
    const next: Taste = {
      key,
      label,
      told: false,
      strength: Math.min(
        TASTE_STRENGTH_CAP,
        (existing === undefined ? 0 : strengthAt(existing, clock.now)) + weight,
      ),
      updatedAt: clock.now,
    };
    tastes =
      existing === undefined
        ? [...tastes, next]
        : tastes.map((taste) => (taste.key === key ? next : taste));
  }
  return tastes === memory.tastes ? memory : { ...memory, tastes: capTastes(tastes, clock.now) };
}

/** Over the limit, the weakest noticed tastes go first; told ones are never dropped for room. */
function capTastes(tastes: Taste[], now: number): Taste[] {
  if (tastes.length <= MAX_TASTES) return tastes;
  const dropable = tastes
    .filter((taste) => !taste.told)
    .sort((a, b) => strengthAt(a, now) - strengthAt(b, now));
  const drop = new Set(dropable.slice(0, tastes.length - MAX_TASTES).map((taste) => taste.key));
  return tastes.filter((taste) => !drop.has(taste.key));
}

/** The visitor tells Noren a taste. A noticed one of the same name becomes a told one. */
export function addTaste(memory: Memory, text: string, clock: Clock): Memory {
  const draft = tasteFromText(text);
  if (draft === null) return memory;
  const existing = memory.tastes.find((taste) => taste.key === draft.key);
  if (existing?.told) return memory;
  if (existing === undefined && memory.tastes.filter((taste) => taste.told).length >= MAX_TASTES) {
    return memory;
  }
  const told: Taste = {
    key: draft.key,
    label: draft.label,
    told: true,
    strength: TASTE_STRENGTH_CAP,
    updatedAt: clock.now,
  };
  const tastes =
    existing === undefined
      ? [...memory.tastes, told]
      : memory.tastes.map((taste) => (taste.key === draft.key ? told : taste));
  return { ...memory, tastes: capTastes(tastes, clock.now) };
}

export function removeTaste(memory: Memory, key: string): Memory {
  return memory.tastes.some((taste) => taste.key === key)
    ? { ...memory, tastes: memory.tastes.filter((taste) => taste.key !== key) }
    : memory;
}

// ---------------------------------------------------------------------------------------------
// Rules

export function rulesFull(memory: Memory): boolean {
  return memory.rules.length >= MAX_RULES;
}

/** Adds a hard rule from a phrase. A rule with the same tag is not added twice. */
export function addRule(memory: Memory, text: string): Memory {
  const draft = ruleFromText(text);
  if (draft === null || rulesFull(memory)) return memory;
  if (memory.rules.some((rule) => rule.tag === draft.tag)) return memory;
  return { ...memory, rules: [...memory.rules, { id: `${draft.kind}:${draft.tag}`, ...draft }] };
}

export function removeRule(memory: Memory, id: string): Memory {
  return memory.rules.some((rule) => rule.id === id)
    ? { ...memory, rules: memory.rules.filter((rule) => rule.id !== id) }
    : memory;
}

// ---------------------------------------------------------------------------------------------
// Today's trip

/** Drops the entries of an earlier day unless they were kept, and moves the memory to today. */
export function rollTrip(memory: Memory, clock: Clock): Memory {
  const today = localDay(clock.now, clock.utcOffsetHours);
  if (memory.trip.day === today) return memory;
  return {
    ...memory,
    trip: { day: today, items: memory.trip.items.filter((item) => item.kept) },
  };
}

export function addVisited(
  memory: Memory,
  entry: { label: string; slug?: string },
  clock: Clock,
): Memory {
  const label = entry.label.trim().replace(/\s+/g, " ");
  if (label === "" || label.length > MAX_LABEL_LENGTH * 2) return memory;
  const rolled = rollTrip(memory, clock);
  if (rolled.trip.items.length >= MAX_TRIP_ITEMS) return rolled;
  const same = (item: TripItem) =>
    entry.slug !== undefined ? item.slug === entry.slug : canon(item.label) === canon(label);
  if (rolled.trip.items.some(same)) return rolled;
  const taken = new Set(rolled.trip.items.map((item) => item.id));
  let n = rolled.trip.items.length;
  while (taken.has(`${clock.now.toString(36)}-${n}`)) n++;
  const item: TripItem = {
    id: `${clock.now.toString(36)}-${n}`,
    label,
    ...(entry.slug === undefined ? {} : { slug: entry.slug }),
    addedAt: clock.now,
    kept: false,
  };
  return { ...rolled, trip: { ...rolled.trip, items: [...rolled.trip.items, item] } };
}

export function removeVisited(memory: Memory, id: string): Memory {
  return memory.trip.items.some((item) => item.id === id)
    ? { ...memory, trip: { ...memory.trip, items: memory.trip.items.filter((i) => i.id !== id) } }
    : memory;
}

/** Keeps an entry past the end of the day, or lets it go with the day again. */
export function setKept(memory: Memory, id: string, kept: boolean): Memory {
  return memory.trip.items.some((item) => item.id === id && item.kept !== kept)
    ? {
        ...memory,
        trip: {
          ...memory.trip,
          items: memory.trip.items.map((item) => (item.id === id ? { ...item, kept } : item)),
        },
      }
    : memory;
}

// ---------------------------------------------------------------------------------------------
// Housekeeping and "forget everything"

/**
 * What to do whenever the memory is read: forget noticed tastes that have faded away and wipe
 * yesterday's trip. Returns the same object when there is nothing to do.
 */
export function tidy(memory: Memory, clock: Clock): Memory {
  const faded = memory.tastes.filter(
    (taste) => !taste.told && strengthAt(taste, clock.now) < TASTE_FORGOTTEN_BELOW,
  );
  const withoutFaded =
    faded.length === 0
      ? memory
      : { ...memory, tastes: memory.tastes.filter((taste) => !faded.includes(taste)) };
  return rollTrip(withoutFaded, clock);
}

/** The visitor asked Noren to forget everything. */
export function forgetEverything(clock: Clock): Memory {
  return emptyMemory(clock);
}

// ---------------------------------------------------------------------------------------------
// What a request carries

/**
 * The part of the memory a planner request needs, and nothing more. Hard rules go as the tags the
 * draw reads; tastes as the few interests that tilt it; today's trip as short labels (and the slug
 * when it names a place Noren knows). It is built fresh for each request and never stored by Noren.
 */
export type MemorySnapshot = {
  avoid: string[];
  interests: string[];
  done: { label: string; slug?: string }[];
};

export function snapshotOf(memory: Memory, clock: Clock): MemorySnapshot {
  const rolled = rollTrip(memory, clock);
  return {
    avoid: memory.rules.map((rule) => rule.tag),
    interests: topTastes(memory, clock.now).map((taste) => taste.key),
    done: rolled.trip.items.map((item) => ({
      label: item.label,
      ...(item.slug === undefined ? {} : { slug: item.slug }),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Proposals: the planner suggests, the visitor decides

/**
 * A change the planner chat suggests after the visitor said something about themselves. Nothing
 * changes until the visitor says Yes: `applyProposal` is the only way a proposal reaches the memory.
 */
export type Proposal = {
  id: string;
  op: "add" | "remove";
  kind: "rule" | "taste" | "visited";
  text: string;
  /** The visitor's own words the proposal rests on, copied from what they wrote. */
  saidAs: string;
};

function matchingVisited(memory: Memory, text: string): TripItem[] {
  const wanted = canon(text);
  return memory.trip.items.filter((item) => canon(item.label) === wanted);
}

/** Whether saying Yes would change anything. A proposal that would not is never shown. */
export function proposalHasEffect(memory: Memory, proposal: Proposal): boolean {
  switch (proposal.kind) {
    case "rule": {
      const draft = ruleFromText(proposal.text);
      if (draft === null) return false;
      const present = memory.rules.some((rule) => rule.tag === draft.tag);
      return proposal.op === "add" ? !present && !rulesFull(memory) : present;
    }
    case "taste": {
      const draft = tasteFromText(proposal.text);
      if (draft === null) return false;
      const existing = memory.tastes.find((taste) => taste.key === draft.key);
      return proposal.op === "add" ? existing?.told !== true : existing !== undefined;
    }
    case "visited":
      return proposal.op === "add"
        ? canon(proposal.text) !== "" && matchingVisited(memory, proposal.text).length === 0
        : matchingVisited(memory, proposal.text).length > 0;
  }
}

export function relevantProposals(memory: Memory, proposals: readonly Proposal[]): Proposal[] {
  return proposals.filter((proposal) => proposalHasEffect(memory, proposal));
}

/** The visitor said Yes. */
export function applyProposal(memory: Memory, proposal: Proposal, clock: Clock): Memory {
  switch (proposal.kind) {
    case "rule": {
      if (proposal.op === "add") return addRule(memory, proposal.text);
      const draft = ruleFromText(proposal.text);
      const found = draft && memory.rules.find((rule) => rule.tag === draft.tag);
      return found ? removeRule(memory, found.id) : memory;
    }
    case "taste": {
      if (proposal.op === "add") return addTaste(memory, proposal.text, clock);
      const draft = tasteFromText(proposal.text);
      return draft === null ? memory : removeTaste(memory, draft.key);
    }
    case "visited": {
      if (proposal.op === "add") return addVisited(memory, { label: proposal.text }, clock);
      return matchingVisited(memory, proposal.text).reduce(
        (next, item) => removeVisited(next, item.id),
        memory,
      );
    }
  }
}

/** The visitor said No. The memory stays exactly as it was. */
export function declineProposal(memory: Memory): Memory {
  return memory;
}
