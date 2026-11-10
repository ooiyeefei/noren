import type { Rng } from "./rng";
import { drawWeight, type DrawCandidate } from "./weights";

/** Gives each item a number strictly between 0 and 1. */
export type Uniform<T> = (item: T, index: number) => number;

/** One new number from a generator for every item, in order. */
export const uniformFromRng =
  <T>(rng: Rng): Uniform<T> =>
  () => {
    const value = rng();
    return value === 0 ? Number.MIN_VALUE : value;
  };

/**
 * Weighted sampling without replacement (Efraimidis and Spirakis, 2006). Each item gets the key
 * u^(1/w), where u is a random number between 0 and 1 and w is its weight, and the `count` items
 * with the largest keys are the draw. An item with twice the weight is twice as likely to be
 * picked first, and nobody is picked twice.
 *
 * The code compares ln(u)/w instead of u^(1/w). The two order items identically, and the logarithm
 * cannot underflow to 0 when a weight is small. Items with a weight of 0 or less are never drawn.
 * Ties go to the earlier item, so a fixed input and a fixed random source give a fixed draw.
 */
export function sampleWithoutReplacement<T>(
  items: readonly T[],
  count: number,
  weightOf: (item: T) => number,
  uniform: Uniform<T>,
): T[] {
  const keyed: { item: T; key: number; index: number }[] = [];
  items.forEach((item, index) => {
    const weight = weightOf(item);
    if (!(weight > 0)) return;
    keyed.push({ item, key: Math.log(uniform(item, index)) / weight, index });
  });
  keyed.sort((a, b) => b.key - a.key || a.index - b.index);
  return keyed.slice(0, Math.max(0, count)).map(({ item }) => item);
}

export const ADVENTUROUSNESS = ["familiar", "mixed", "surprise"] as const;
export type Adventurousness = (typeof ADVENTUROUSNESS)[number];

/**
 * How many of `stops` are wild cards. Out of 3 stops: familiar 0, mixed 1, surprise 2. Other sizes
 * keep the same shares (none, a third, two thirds). A mixed walk of one stop has no wild card, and
 * a surprise walk of one or two stops is all wild.
 */
export function wildCardCount(adventurousness: Adventurousness, stops: number): number {
  if (adventurousness === "familiar") return 0;
  if (adventurousness === "mixed") return Math.round(stops / 3);
  return Math.min(stops, Math.ceil((2 * stops) / 3));
}

export type DrawnStop<T> = { candidate: T; wildCard: boolean };

/**
 * Draws a walk's stops from the candidates that survived the hard rules. Regular stops come first,
 * tilted toward the traveller's interests; wild cards are then drawn from what is left. The list
 * comes back in draw order. Putting it in walking order is a separate step (./route.ts).
 */
export function drawStops<T extends DrawCandidate>(
  pool: readonly T[],
  options: { count: number; adventurousness: Adventurousness; rng: Rng },
): DrawnStop<T>[] {
  const count = Math.min(options.count, pool.length);
  const wild = Math.min(wildCardCount(options.adventurousness, count), count);
  const uniform = uniformFromRng<T>(options.rng);
  const regular = sampleWithoutReplacement(
    pool,
    count - wild,
    (candidate) => drawWeight(candidate, { wildCard: false }),
    uniform,
  );
  const taken = new Set(regular);
  const wildCards = sampleWithoutReplacement(
    pool.filter((candidate) => !taken.has(candidate)),
    wild,
    (candidate) => drawWeight(candidate, { wildCard: true }),
    uniform,
  );
  return [
    ...regular.map((candidate) => ({ candidate, wildCard: false })),
    ...wildCards.map((candidate) => ({ candidate, wildCard: true })),
  ];
}
