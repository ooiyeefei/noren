"use client";

import { createContext, useContext } from "react";

export type FeatureLinks = { planner: boolean; walk: boolean };

const Features = createContext<FeatureLinks>({ planner: false, walk: false });

/**
 * Which switched features are on in the region file (features.*), handed down from the server
 * layout because the footer and the account menu render inside client pages, where the region file
 * can't be read. A switch that is off shows no link anywhere, and its page answers not found.
 */
export function FeatureLinksProvider({
  planner = false,
  walk = false,
  children,
}: Partial<FeatureLinks> & { children: React.ReactNode }) {
  return <Features value={{ planner, walk }}>{children}</Features>;
}

export function useFeatureLinks(): FeatureLinks {
  return useContext(Features);
}
