// Seeded random numbers. Everything in src/lib/draw takes its randomness as an argument, so a test
// (or the daily omikuji) can replay exactly the same draw, and a real walk can use Math.random.

/** Returns a number from 0 up to, but not including, 1. */
export type Rng = () => number;

/** A 32-bit fingerprint of a piece of text (FNV-1a). The same text always gives the same number. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small, fast seeded generator. The same seed gives the same sequence. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator whose sequence is fixed by a piece of text, such as "2026-11-10|suwa". */
export function seededRng(seedText: string): Rng {
  return mulberry32(hashString(seedText));
}

/**
 * One number strictly between 0 and 1, fixed by the seed text and a key (say, a place's id), with
 * no sequence behind it. Because a place's number does not depend on which other places are in
 * the draw, adding or removing one place does not reshuffle the others. The daily omikuji uses
 * this so a new listing mid-day does not change everyone's slip.
 */
export function keyedUniform(seedText: string, key: string): number {
  const value = mulberry32(hashString(`${seedText}\u0000${key}`))();
  return value === 0 ? Number.MIN_VALUE : value;
}
