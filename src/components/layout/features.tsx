"use client";

import { createContext, useContext } from "react";

export type FeatureLinks = { planner: boolean; walk: boolean; postcard: boolean; trip: boolean };

const Features = createContext<FeatureLinks>({
  planner: false,
  walk: false,
  postcard: false,
  trip: false,
});

/**
 * Which switched features are on in the region file (features.*), handed down from the server
 * layout because the footer and the account menu render inside client pages, where the region file
 * can't be read. A switch that is off shows no link anywhere, and its page answers not found. `trip` is different: it says whether this person can open trips,
 * which the account menu reads from people.current (the region switch alone does not decide it).
 */
export function FeatureLinksProvider({
  planner = false,
  walk = false,
  postcard = false,
  trip = false,
  children,
}: Partial<FeatureLinks> & { children: React.ReactNode }) {
  return <Features value={{ planner, walk, postcard, trip }}>{children}</Features>;
}

export function useFeatureLinks(): FeatureLinks {
  return useContext(Features);
}
