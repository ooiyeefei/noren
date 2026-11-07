"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AddStory, type AddStoryProps } from "@/components/place/add-story";
import { messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { PLACE_TABS, nextPlaceTab, placeTabSearch, type PlaceTab } from "@/lib/place/tabs";
import { cn } from "@/lib/utils";

/** What the tabs tell the story form: how many times the person asked to write, and where it sits. */
const WriteRequest = createContext<{
  request: number;
  slot: React.RefObject<HTMLDivElement | null>;
} | null>(null);

/**
 * The story form, with the tabs' "Add your story" request wired in: a request opens the written form
 * and scrolls it into view. The form itself is unchanged.
 */
export function StoryComposer(props: AddStoryProps) {
  const tabs = useContext(WriteRequest);
  return (
    <div ref={tabs?.slot} id="write" className="scroll-mt-16">
      <AddStory {...props} openWritten={tabs?.request} />
    </div>
  );
}

const TAB_ID = (base: string, tab: PlaceTab) => `${base}-tab-${tab}`;
const PANEL_ID = (base: string, tab: PlaceTab) => `${base}-panel-${tab}`;

/**
 * Stories, Visit and About. Every panel stays mounted so a half-written story survives a tab
 * change, but only the open one is shown. The Visit panel's `lazy` content (the map) is built the
 * first time Visit opens. The open tab is kept in the address with `history.replaceState`, so a
 * reload (iOS drops idle tabs) lands where the person was.
 */
export function PlaceTabs({
  locale,
  initialTab,
  initialWrite,
  signedIn,
  canWrite,
  signInHref,
  visitDot,
  stories,
  visit,
  visitLazy,
  about,
}: {
  locale: Locale;
  initialTab: PlaceTab;
  /** The address asked for the written form (`&write=1`). */
  initialWrite: boolean;
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
  /** False where the page takes no stories (the fictional demo place). */
  canWrite: boolean;
  /** Where a signed-out person goes to write; unset while they couldn't get an account anyway. */
  signInHref?: string;
  /** Something on Visit the person has not done yet. */
  visitDot: boolean;
  stories: ReactNode;
  visit: ReactNode;
  /** Shown under `visit` only once Visit has been opened. */
  visitLazy?: ReactNode;
  about: ReactNode;
}) {
  const m = messagesFor(placePageMessages, locale);
  const base = useId();
  const slot = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<PlaceTab>(initialTab);
  const [seenVisit, setSeenVisit] = useState(initialTab === "visit");
  const [request, setRequest] = useState(initialWrite ? 1 : 0);
  const [formOpen, setFormOpen] = useState(false);
  const refs = useRef<Partial<Record<PlaceTab, HTMLButtonElement | null>>>({});
  const tabLabel: Record<PlaceTab, string> = {
    stories: m.tabStories,
    visit: m.tabVisit,
    about: m.tabAbout,
  };

  function show(next: PlaceTab) {
    setTab(next);
    if (next === "visit") setSeenVisit(true);
    try {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${placeTabSearch(window.location.search, next)}${window.location.hash}`,
      );
    } catch {
      // The address is a convenience; the tab still changes.
    }
  }
  function onKeyDown(event: KeyboardEvent) {
    const next = nextPlaceTab(tab, event.key);
    if (!next) return;
    event.preventDefault();
    show(next);
    refs.current[next]?.focus();
  }
  function write() {
    show("stories");
    setRequest((count) => count + 1);
  }

  // The form closing or opening is read off the page, so the form itself needs no new callbacks.
  useEffect(() => {
    const element = slot.current;
    if (!element) return;
    const read = () => setFormOpen(element.querySelector("form") !== null);
    const observer = new MutationObserver(read);
    observer.observe(element, { childList: true, subtree: true });
    read();
    return () => observer.disconnect();
  }, []);
  // A request to write brings the form into view once its tab is showing.
  useEffect(() => {
    if (request === 0 || tab !== "stories") return;
    slot.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [request, tab]);

  const panels: Record<PlaceTab, ReactNode> = {
    stories,
    visit: (
      <>
        {visit}
        {seenVisit && visitLazy}
      </>
    ),
    about,
  };
  return (
    <WriteRequest.Provider value={{ request, slot }}>
      <div
        role="tablist"
        aria-label={m.tabsLabel}
        onKeyDown={onKeyDown}
        className="sticky top-0 z-20 -mx-4 flex border-b border-line bg-background px-4"
      >
        {PLACE_TABS.map((value) => {
          const selected = tab === value;
          return (
            <button
              key={value}
              ref={(element) => {
                refs.current[value] = element;
              }}
              type="button"
              role="tab"
              id={TAB_ID(base, value)}
              aria-selected={selected}
              aria-controls={PANEL_ID(base, value)}
              tabIndex={selected ? 0 : -1}
              onClick={() => show(value)}
              className={cn(
                "relative -mb-px flex min-h-12 flex-1 items-center justify-center gap-2 border-b-[3px] px-3 text-[16px] font-bold focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ai",
                selected ? "border-kon text-kon" : "border-transparent text-kon/70",
              )}
            >
              {tabLabel[value]}
              {value === "visit" && visitDot && (
                <>
                  <span
                    aria-hidden="true"
                    data-visit-dot=""
                    className="size-2.5 rounded-full bg-kasutera ring-1 ring-kon/40"
                  />
                  <span className="sr-only">{m.visitDot}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {PLACE_TABS.map((value) => (
        <div
          key={value}
          role="tabpanel"
          id={PANEL_ID(base, value)}
          aria-labelledby={TAB_ID(base, value)}
          hidden={tab !== value}
          tabIndex={-1}
          className="space-y-8 pt-6 pb-24 sm:pb-6"
        >
          {panels[value]}
        </div>
      ))}
      {/* Phones only: the one thing most people came to do, always in reach. */}
      {canWrite && !formOpen && (signedIn || (signedIn === false && signInHref)) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(env(safe-area-inset-bottom),12px)] sm:hidden">
          {signedIn ? (
            <button
              type="button"
              data-add-story=""
              onClick={write}
              className="pointer-events-auto inline-flex min-h-12 w-full max-w-[720px] items-center justify-center rounded-[10px] bg-kon px-5 font-bold text-white shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              {m.addYourStory}
            </button>
          ) : (
            <a
              data-add-story=""
              href={signInHref}
              className="pointer-events-auto inline-flex min-h-12 w-full max-w-[720px] items-center justify-center rounded-[10px] bg-kon px-5 font-bold text-white shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            >
              {m.addYourStory}
            </a>
          )}
        </div>
      )}
    </WriteRequest.Provider>
  );
}
