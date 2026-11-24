"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RegionConfig } from "@/lib/region/schema";
import {
  createTripStore,
  type StoredParty,
  type StoredTrip,
  type TripData,
} from "@/lib/trip/storage";

// The one trip store of these pages, backed by the browser's local storage like the memory store.
// It is created on first use in the browser, so the server renders no trips and the page fills in
// after it loads. Nothing here talks to a server.

type TripStore = ReturnType<typeof createTripStore>;
let store: TripStore | undefined;

export function tripStore(): TripStore {
  store ??= createTripStore();
  return store;
}

export function useTrips() {
  const current = tripStore();
  const data = useSyncExternalStore(current.subscribe, current.get, current.getServerSnapshot);
  useEffect(() => {
    // Another tab changed it, or the page came back into view.
    const reload = () => current.reload();
    window.addEventListener("storage", reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    reload();
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [current]);
  return { data, update: current.update, canKeep: current.canKeep() };
}

/** The part of a region file the trip pages read, so a page can hand it to a client component. */
export type TripPageRegion = Pick<RegionConfig, "id" | "towns" | "roads" | "trip">;

// What the pages ask of a stored trip and party. Pure, and each returns the whole data so it can be
// handed straight to the store's `update`.

export function blankParty(id: string): StoredParty {
  return { id, name: "", kept: false, travellers: [], needs: [] };
}

export function blankTrip(id: string, partyId: string, regionId: string): StoredTrip {
  return {
    id,
    regionId,
    start: "",
    end: "",
    days: 1,
    purpose: "",
    partyId,
    pins: [],
    avoid: [],
    changes: [],
    status: "planning",
  } as StoredTrip;
}

/** A trip that has been started but not yet planned: the questions resume here. */
export function resumable(data: TripData): StoredTrip | undefined {
  return data.trips.find((trip) => trip.plan === undefined);
}

/** Saves the draft the first time an answer is given. Newest trips come first. */
export function withDraft(data: TripData, trip: StoredTrip, party: StoredParty): TripData {
  if (data.trips.some((t) => t.id === trip.id)) return data;
  return {
    ...data,
    trips: [trip, ...data.trips],
    parties: data.parties.some((p) => p.id === party.id) ? data.parties : [...data.parties, party],
  };
}

export function patchTrip(data: TripData, id: string, patch: Partial<StoredTrip>): TripData {
  const trip = data.trips.find((t) => t.id === id);
  const days = patch.days;
  return {
    ...data,
    trips: data.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    // Fewer days: a traveller is no longer on a day the trip does not have.
    parties:
      trip && days !== undefined && days < trip.days
        ? data.parties.map((p) =>
            p.id !== trip.partyId
              ? p
              : {
                  ...p,
                  travellers: p.travellers.map(({ days: on, ...t }) => {
                    const kept = on?.filter((d) => d <= days);
                    return kept && kept.length > 0 && kept.length < days ? { ...t, days: kept } : t;
                  }),
                },
          )
        : data.parties,
  };
}

export function patchParty(data: TripData, id: string, patch: Partial<StoredParty>): TripData {
  return { ...data, parties: data.parties.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Changing the number of days drops what no longer fits: nights, pins, and days a traveller is on. */
export function withDays(trip: StoredTrip, days: number): Partial<StoredTrip> {
  return {
    days,
    nights: trip.nights && trip.nights.length === days - 1 ? trip.nights : undefined,
    pins: trip.pins.filter((pin) => pin.day <= days),
  };
}

export function tripGroup(trip: StoredTrip): "underWay" | "planned" | "notPlanned" | "finished" {
  if (trip.status === "finished") return "finished";
  if (trip.plan === undefined) return "notPlanned";
  return trip.status === "under_way" ? "underWay" : "planned";
}
