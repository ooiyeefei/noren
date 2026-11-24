import { keyedUniform } from "../draw/rng";
import { travellersOn } from "./checks";
import type { PartySnapshot, Plan, Stop } from "./types";

export type Turn = Extract<Stop["because"], { kind: "turn" }>;

export function turnsOn(items: Plan["days"][number]["items"], exempt: ReadonlySet<string>) {
  return items.flatMap((item) =>
    item.kind === "stop" && item.because.kind === "turn" && !exempt.has(item.slot)
      ? [item.because.for]
      : [],
  );
}

/** Rotation changes tie order without letting a change of likes reseed the slots. */
export function turnsFor(party: PartySnapshot, seed: string) {
  const keys = party.travellers.map(({ key }) => key).sort();
  const rotation = Math.floor(keyedUniform(seed + "|turns", "rotation") * keys.length);
  const order = [...keys.slice(rotation), ...keys.slice(0, rotation)];
  return (day: number, previous: Plan["days"], exempt: ReadonlySet<string>) => {
    const present = travellersOn(party, day).filter(({ likes }) => likes.length > 0);
    const counts = new Map<string, number>();
    const today = new Set<string>();
    for (const earlier of previous) {
      for (const key of turnsOn(earlier.items, exempt)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const yesterday = previous.at(-1);
    const left = new Set<string>();
    if (yesterday) {
      const had = new Set(turnsOn(yesterday.items, exempt));
      for (const traveller of travellersOn(party, yesterday.index)) {
        if (had.size > 0 && traveller.likes.length && !had.has(traveller.key))
          left.add(traveller.key);
      }
    }
    return {
      next(): Turn | undefined {
        const pool = present.toSorted(
          (a, b) =>
            Number(today.has(a.key)) - Number(today.has(b.key)) ||
            Number(left.has(b.key) && !today.has(b.key)) -
              Number(left.has(a.key) && !today.has(a.key)) ||
            (counts.get(a.key) ?? 0) - (counts.get(b.key) ?? 0) ||
            order.indexOf(a.key) - order.indexOf(b.key),
        );
        const traveller = pool[0];
        return traveller && { kind: "turn", for: traveller.key, likes: [...traveller.likes] };
      },
      accept(turn: Turn) {
        today.add(turn.for);
        counts.set(turn.for, (counts.get(turn.for) ?? 0) + 1);
      },
    };
  };
}

export type DayTurns = ReturnType<ReturnType<typeof turnsFor>>;
