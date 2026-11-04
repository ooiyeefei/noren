"use client";

import { useSyncExternalStore } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
const subscribe = () => () => {};

/**
 * The start of today in UTC, for a query that needs the time: a query may not read the clock, and a
 * value shared by everyone today shares its cached result too. Null while rendering on the server.
 */
export function useToday(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / DAY_MS) * DAY_MS,
    () => null,
  );
}
