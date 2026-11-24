import "server-only";

import { notFound, redirect } from "next/navigation";
import { getActiveRegion, getRegions } from "@/lib/region";
import { currentPersonOnServer } from "./server";

type Switch = "off" | "trial" | "open";

/**
 * Whether a visitor may open the trip pages. Pure, so it can be tested. The door is shut by default:
 * "off" shuts it for everyone, and "trial" opens it only to a person whose `trip` flag is true.
 * `trip` is read as a flag that must be exactly true, so a missing field fails closed.
 */
export function tripDoor(
  trip: Switch,
  person: { trip?: boolean } | null,
): "open" | "not_found" | "sign_in" {
  if (trip === "off") return "not_found";
  if (trip === "trial") return person?.trip === true ? "open" : "not_found";
  return person === null ? "sign_in" : "open";
}

/**
 * Every trip page calls this before anything streams, so the answer is a real 404 and not an empty
 * page. While the switch is "trial", signed-out visitors get the same 404 as signed-in people who
 * are not on the trial. When it is "open", a signed-out visitor is sent to sign in and back.
 */
export async function requireTripDoor(locale: string, path: string): Promise<void> {
  const trip = getActiveRegion().features.trip;
  if (trip === "off") notFound();
  const person = await currentPersonOnServer();
  // `trip` is added to people.current by another change; until then it reads as missing.
  const door = tripDoor(trip, person as { trip?: boolean } | null);
  if (door === "not_found") notFound();
  if (door === "sign_in") {
    redirect(`/${locale}/sign-in?redirect_url=${encodeURIComponent(`/${locale}${path}`)}`);
  }
}

/**
 * The region whose roads the trip pages use, cut down to what the pages read: today the only one
 * with a road table. Nothing here is per person. A 404 when no region has roads.
 */
export function tripPageRegion() {
  const region = [...getRegions().values()].find((r) => r.roads && r.trip);
  if (!region) notFound();
  const { id, towns, roads, trip } = region;
  return { id, towns, roads, trip };
}

/**
 * The shared trip page's own door. The page is read by the party with no account, so the only
 * question is whether the trip switch is on at all: "off" is a real 404, "trial" and "open" both
 * let a link be read. Whoever holds the link's code may read it; nothing here looks at a person.
 */
export function requireSharedTripDoor(): void {
  if (getActiveRegion().features.trip === "off") notFound();
}

/** The part of a region file the shared page reads, by the region the link was made in. */
export function sharedTripRegion(regionId: string) {
  const region = getRegions().get(regionId);
  if (!region) notFound();
  const { defaultLocale, nameFallback, categories, roads, towns } = region;
  return { defaultLocale, nameFallback, categories, roads, towns };
}
