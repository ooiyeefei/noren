import { distanceMetres } from "@/lib/overture/dedupe";
import type { LocationRead } from "@/lib/collection/location";
import { SLIP_OPEN_METRES } from "@/lib/walk/constants";
import { isInRange, isUsableFix } from "@/lib/walk/proximity";
import type { Fix, Pin } from "@/lib/walk/types";

// Whether a phone is at a slip's door. This runs on the phone and asks Noren for nothing: it takes a
// reading and a pin, and answers. It is the same rule a story coming into range uses.

export type DoorResult =
  | { kind: "open" }
  /** Near enough to know it is not at the door yet; metres is the straight line, rounded. */
  | { kind: "far"; metres: number }
  /** The phone's own error is too large to say. */
  | { kind: "rough"; accuracy: number }
  /** No reading: refused, unsupported, timed out. */
  | { kind: "none" };

export function checkDoor(fix: Fix, pin: Pin, accuracyAllowanceMetres: number): DoorResult {
  if (!isUsableFix(fix)) return { kind: "rough", accuracy: Math.round(fix.accuracy) };
  const metres = distanceMetres(fix, pin);
  return isInRange(metres, fix.accuracy, accuracyAllowanceMetres, SLIP_OPEN_METRES)
    ? { kind: "open" }
    : { kind: "far", metres: Math.round(metres) };
}

/** "I'm at the door": one reading, taken now, and the answer. */
export async function knockAtDoor(
  locate: () => Promise<LocationRead>,
  pin: Pin,
  accuracyAllowanceMetres: number,
): Promise<DoorResult> {
  const read = await locate();
  if (read.kind !== "read") return { kind: "none" };
  return checkDoor(read, pin, accuracyAllowanceMetres);
}
