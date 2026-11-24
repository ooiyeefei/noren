"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * The name shown beside the logo. Every page shows the site's region, except where a map can say
 * better: the map page reports the region its view is inside (or none), and the name follows it.
 * `undefined` means nobody has reported, so the header keeps the name the server gave it.
 */
type Reported = string | null | undefined;
const Report = createContext<{
  name: Reported;
  set(name: Reported): void;
}>({ name: undefined, set: () => undefined });

export function RegionNameProvider({ children }: { children: ReactNode }) {
  const [name, set] = useState<Reported>(undefined);
  const value = useMemo(() => ({ name, set }), [name]);
  return <Report.Provider value={value}>{children}</Report.Provider>;
}

/** The header's name: what the map reported, else the server's name. Nothing when the map is over no region. */
export function RegionName({ fallback }: { fallback: string }) {
  const { name } = useContext(Report);
  return name === undefined ? fallback : name;
}

/** Called by a map page: the name of the region its view is inside, or null for none. Cleared on leaving. */
export function useReportRegionName(name: string | null | undefined): void {
  const { set } = useContext(Report);
  useEffect(() => {
    set(name);
    return () => set(undefined);
  }, [set, name]);
}
