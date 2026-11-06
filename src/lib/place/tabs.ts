/** The place page's three tabs and the address that remembers which one is open (contract C1). */
export const PLACE_TABS = ["stories", "visit", "about"] as const;
export type PlaceTab = (typeof PLACE_TABS)[number];

export type PlaceTabState = { tab: PlaceTab; write: boolean };

const isTab = (value: string | undefined): value is PlaceTab =>
  PLACE_TABS.some((tab) => tab === value);

type Raw = string | readonly string[] | undefined;
const first = (value: Raw) => (Array.isArray(value) ? value[0] : (value as string | undefined));

/**
 * Reads `?tab=` and `&write=1`. No tab, or one we don't know, means stories. Asking to write always
 * lands on stories, because that is where the form is.
 */
export function readPlaceTab(params: { tab?: Raw; write?: Raw }): PlaceTabState {
  const write = first(params.write) === "1";
  const tab = first(params.tab);
  return { tab: write ? "stories" : isTab(tab) ? tab : "stories", write };
}

/**
 * The search string for a tab, keeping any other parameters. Stories is the default and leaves no
 * `tab`. `write` is dropped once the form has been asked for, so a reload doesn't ask again.
 */
export function placeTabSearch(current: string, tab: PlaceTab): string {
  const params = new URLSearchParams(current);
  params.delete("write");
  if (tab === "stories") params.delete("tab");
  else params.set("tab", tab);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern); anything else returns null. */
export function nextPlaceTab(current: PlaceTab, key: string): PlaceTab | null {
  const index = PLACE_TABS.indexOf(current);
  if (key === "ArrowRight") return PLACE_TABS[(index + 1) % PLACE_TABS.length]!;
  if (key === "ArrowLeft") return PLACE_TABS[(index + PLACE_TABS.length - 1) % PLACE_TABS.length]!;
  if (key === "Home") return PLACE_TABS[0];
  if (key === "End") return PLACE_TABS[PLACE_TABS.length - 1]!;
  return null;
}
