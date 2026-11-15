import type { WalkMessageTable } from "@/lib/i18n/messages/walk";
import type { Compass } from "@/lib/walk/direction";

/** The message that names each compass point, for a place's direction from the person. */
export const COMPASS_WORD = {
  n: "compassN",
  ne: "compassNE",
  e: "compassE",
  se: "compassSE",
  s: "compassS",
  sw: "compassSW",
  w: "compassW",
  nw: "compassNW",
} as const satisfies Record<Compass, keyof WalkMessageTable>;
