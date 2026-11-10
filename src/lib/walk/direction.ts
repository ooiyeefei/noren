import type { Pin } from "./types";

const COMPASS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;
export type Compass = (typeof COMPASS)[number];

/** The bearing from one point to another in degrees clockwise from north, 0 up to 360. */
export function bearingDegrees(from: Pin, to: Pin): number {
  const rad = Math.PI / 180;
  const dLng = (to.lng - from.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(to.lat * rad);
  const x =
    Math.cos(from.lat * rad) * Math.sin(to.lat * rad) -
    Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos(dLng);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** The eight-point compass direction for a bearing. */
export function compassPoint(degrees: number): Compass {
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return COMPASS[index]!;
}
