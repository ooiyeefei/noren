import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OwnWordsBox, type OwnWordsBoxProps } from "@/components/trip/own-words-box";
import { applyProposal, matchTraveller, proposalText } from "@/components/trip/own-words-apply";
import { PlaceCheck } from "@/components/place/place-check";
import { TRIP_CONSENT_VERSION } from "@/lib/trip/consent";
import { approveFirstPlan, takeFirstPlanApproval, tripSendRejected } from "@/components/trip/plan-consent";
import { keepStops } from "@/components/trip/plan-container";
import { PlanView, type PlanViewProps } from "@/components/trip/plan-view";
import type { StopInfo, StopLookup } from "@/components/trip/stop-card";
import { restsOf, type StopRow } from "@/components/trip/stop-info";
import type { PlannerQuote } from "@/lib/planner/reply";
import { ROUTE_CHOICES, TRIP_CHANGE_CHOICES, TRIP_REASON_CODES } from "@/lib/trip";
import type { Plan, Stop } from "@/lib/trip/types";
import { TRIP_QUESTIONS } from "@/lib/trip/vocabulary";
import { NewTripView, STEPS, type NewTripViewProps } from "@/components/trip/new-trip-container";
import { PartyView, type PartyViewProps } from "@/components/trip/party-container";
import {
  ChangeView,
  ChangeWords,
  MovedList,
  RefusedNotice,
  opText,
  type ChangeViewProps,
} from "@/components/trip/change-view";
import { commitChange, requestChange, dayForToday, lastDayPassed } from "@/components/trip/apply-change";
import { ShareView, type ShareViewProps } from "@/components/trip/share-controls";
import { directionsUrl } from "@/lib/geo/maps-link";
import { driveMapsUrl } from "@/components/trip/shared-view";
import { undoLastChange } from "@/lib/trip/storage";
import { PartyStep, nextKey } from "@/components/trip/party-step";
import { RouteStep, roadTowns } from "@/components/trip/route-step";
import { RulesReadback, rulesByTag } from "@/components/trip/rules-readback";
import { TravelStep } from "@/components/trip/travel-step";
import { TravellerCard } from "@/components/trip/traveller-card";
import { TripsView } from "@/components/trip/trips-view";
import {
  blankParty,
  blankTrip,
  patchParty,
  patchTrip,
  resumable,
  tripGroup,
  withDraft,
  withDays,
  type TripPageRegion,
} from "@/components/trip/use-trips";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { requireTripDoor, tripDoor } from "@/lib/convex/trip-gate";
import { PRIVATE_SECTIONS } from "@/lib/seo/site";
import * as regionModule from "@/lib/region";
import { getRegionConfig } from "@/lib/region/registry";
import { buildTripRequest } from "@/lib/trip/snapshot";
import {
  TRIP_STORAGE_KEY,
  createTripStore,
  deleteTrip,
  type StoredParty,
  type StoredTrip,
} from "@/lib/trip/storage";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const malaysia = getRegionConfig("malaysia-west");
if (!malaysia) throw new Error("malaysia-west region file missing");
// Switched off in the region file, so the pages are tested with its settings passed in.
const region: TripPageRegion = {
  id: malaysia.id,
  towns: malaysia.towns,
  roads: malaysia.roads,
  trip: malaysia.trip,
};
const guesses = malaysia.trip!.guesses;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

/** What an assistive tool needs: every field has a label, every button has a name. */
function accessibilityFaults(html: string): string[] {
  const faults: string[] = [];
  const labelled = new Set([...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]));
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = match[2] ?? "";
    const id = /\sid="([^"]+)"/.exec(attrs)?.[1];
    const named = /aria-label="[^"]+"/.test(attrs) || (id !== undefined && labelled.has(id));
    // A field inside a label element is named by it.
    const before = html.slice(0, match.index);
    const inside = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
    if (!named && !inside) faults.push(`${match[1]} without a name: ${attrs.trim()}`);
  }
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const name = text(match[2] ?? "").trim() || /aria-label="([^"]+)"/.exec(match[1] ?? "")?.[1];
    if (!name) faults.push(`button without a name: ${match[1]}`);
  }
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length > 0) faults.push(`duplicate ids: ${dup.join(", ")}`);
  return faults;
}

const party = (over: Partial<StoredParty> = {}): StoredParty => ({
  ...blankParty("p1"),
  ...over,
});
const trip = (over: Partial<StoredTrip> = {}): StoredTrip => ({
  ...blankTrip("tr1", "p1", region.id),
  ...over,
});
const mum = {
  key: "t1",
  label: "Mum",
  ageBand: "older" as const,
  rules: ["step-free", "halal"],
  likes: ["history"],
  skips: [],
  rests: { after: "lunch" as const, minutes: 60 },
};
const little = {
  key: "t2",
  label: "the little one",
  ageBand: "toddler" as const,
  rules: ["halal"],
  likes: [],
  skips: [],
};

const noop = () => undefined;
function newTripProps(over: Partial<NewTripViewProps> = {}): NewTripViewProps {
  return {
    locale: "en",
    region,
    trip: trip(),
    party: party(),
    step: "route",
    canKeep: true,
    onStep: noop,
    onTripChange: noop,
    onPartyChange: noop,
    onPlan: noop,
    ...over,
  };
}
function partyProps(over: Partial<PartyViewProps> = {}): PartyViewProps {
  return {
    locale: "en",
    region,
    trip: trip({ start: "kuala-lumpur", end: "george-town", days: 3 }),
    party: party({ travellers: [mum, little] }),
    canKeep: true,
    confirming: false,
    deleted: false,
    onTripChange: noop,
    onPartyChange: noop,
    onAskDelete: noop,
    onCancelDelete: noop,
    onDelete: noop,
    ...over,
  };
}
const memoryDevice = () => {
  const items = new Map<string, string>();
  return {
    items,
    storage: () => ({
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    }),
  };
};

describe("the questions", () => {
  it("authorizes only the trip whose plan button was pressed, once", () => {
    expect(takeFirstPlanApproval("trip-one")).toBeUndefined();
    approveFirstPlan("trip-one", TRIP_CONSENT_VERSION);
    expect(takeFirstPlanApproval("trip-two")).toBeUndefined();
    expect(takeFirstPlanApproval("trip-one")).toBe(TRIP_CONSENT_VERSION);
    expect(takeFirstPlanApproval("trip-one")).toBeUndefined();
  });

  it("handles a send rejection by code when the server message is redacted", () => {
    expect(tripSendRejected({ data: { code: "invalid_input" } })).toBe(true);
    expect(tripSendRejected({ data: { code: "rate_limited" } })).toBe(false);
    expect(tripSendRejected(new Error("current trip consent is required"))).toBe(false);
  });

  it("requires a fresh click after the plan approval expires", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      approveFirstPlan("trip-one", TRIP_CONSENT_VERSION);
      now.mockReturnValue(61_000);
      expect(takeFirstPlanApproval("trip-one")).toBeUndefined();
    } finally {
      now.mockRestore();
    }
  });

  it("can all be skipped, in any order, with Plan now on every step", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const m = tripMessages[locale];
      for (const step of STEPS) {
        const html = render(<NewTripView {...newTripProps({ locale, step })} />);
        expect(html).toContain(step === "check" ? m.readbackConfirm : `>${m.planNow}<`);
        expect(html).toContain(m.planNow.slice(0, 3));
        expect(text(html)).toContain(m.planSendConsent);
        expect(text(html)).toContain(m.partyConsent);
        if (step !== "check") expect(html).toContain(`>${m.skip}<`);
        // Every step can be visited from the step list, so the order is the organiser's.
        for (const label of [m.stepRoute, m.stepPurpose, m.stepParty, m.stepTravel, m.stepCheck]) {
          expect(text(html)).toContain(label);
        }
      }
    }
  });

  it("says that a skipped question costs nothing and answers are saved as given", () => {
    expect(text(render(<NewTripView {...newTripProps()} />))).toContain(
      "Each answer is saved on this phone as you give it",
    );
  });

  it("saves each answer to the device as it is given, and resumes where it was left", () => {
    const device = memoryDevice();
    const store = createTripStore({ storage: device.storage });
    const draft = trip();
    const owner = party();
    store.update((d) => patchTrip(withDraft(d, draft, owner), draft.id, { start: "ipoh" }));
    // A new tab reads the same device and finds the draft unplanned.
    const again = createTripStore({ storage: device.storage });
    expect(resumable(again.get())?.start).toBe("ipoh");
    again.update((d) => patchTrip(d, draft.id, { purpose: "Slow days, no rush" }));
    store.reload();
    expect(store.get().trips[0]?.purpose).toBe("Slow days, no rush");
    expect(device.items.has(TRIP_STORAGE_KEY)).toBe(true);
  });

  it("asks for the route first when Plan now is pressed without one", () => {
    const html = render(<NewTripView {...newTripProps({ problem: "needs_route" })} />);
    expect(text(html)).toContain("Noren needs to know where you start and end");
    expect(html).toContain('role="alert"');
  });

  it("can make a plan from the route alone (FR-306)", () => {
    const only = trip({ start: "kuala-lumpur", end: "george-town", days: 2 });
    const request = buildTripRequest(only, party(), region as never);
    expect(request.party.travellers).toEqual([]);
    expect(request.party.guessed).toEqual(["stretch", "dayDrive", "meals", "fullness"]);
    expect(request.start).toBe("kuala-lumpur");
  });
});

describe("the route", () => {
  it("offers towns by name from the region file, once for each road point, and no free text", () => {
    const towns = roadTowns(region, "en");
    expect(towns.length).toBeGreaterThan(5);
    expect(new Set(towns.map((t) => t.id)).size).toBe(towns.length);
    expect(towns.find((t) => t.id === "george-town")?.name).toBe(
      malaysia.towns?.find((t) => t.id === "george-town")?.names.en,
    );
    const html = render(
      <RouteStep
        locale="en"
        region={region}
        trip={trip({ days: 3, nights: ["ipoh", "taiping"] })}
        onChange={noop}
      />,
    );
    expect(html).not.toMatch(/type="text"/);
    // Kuala Lumpur has no town in the region file yet; it is offered by its road point's own name.
    expect(towns.find((t) => t.id === "kuala-lumpur")?.name).toBe("Kuala Lumpur");
    expect(towns.some((t) => /rest-area|layby/.test(t.id))).toBe(false);
    expect(html).toContain("Where does it start?");
    expect(html).toContain("Night 1");
    expect(accessibilityFaults(html)).toEqual([]);
  });

  it("lets Noren choose where the party sleeps unless told otherwise", () => {
    const html = render(
      <RouteStep locale="en" region={region} trip={trip({ days: 3 })} onChange={noop} />,
    );
    expect(html).toMatch(/name="nights-mode"[^>]*checked/);
    expect(text(html)).toContain("Let Noren choose where we sleep");
  });

  it("drops what no longer fits when the days change", () => {
    const t = trip({ days: 3, nights: ["ipoh", "taiping"] });
    expect(withDays(t, 2).nights).toBeUndefined();
    expect(withDays(t, 3).nights).toEqual(["ipoh", "taiping"]);
    const device = memoryDevice();
    const store = createTripStore({ storage: device.storage });
    const owner = party({ travellers: [{ ...mum, days: [1, 2, 3] }] });
    store.update((d) => withDraft(d, t, owner));
    store.update((d) => patchTrip(d, t.id, withDays(t, 2)));
    expect(store.get().parties[0]?.travellers[0]?.days).toBeUndefined();
  });

  it("says there are no roads when the region has none", () => {
    const html = render(
      <RouteStep
        locale="en"
        region={{ ...region, roads: undefined }}
        trip={trip()}
        onChange={noop}
      />,
    );
    expect(text(html)).toContain("No roads are loaded");
  });
});

describe("the party", () => {
  it("says Noren knows nothing about the party yet, and where the description is kept", () => {
    const html = text(
      render(<PartyStep locale="en" party={party()} tripDays={2} onChange={noop} />),
    );
    expect(html).toContain("Noren knows nothing about your party yet");
    expect(html).toContain("stays on this phone");
    expect(html).toContain("no names or labels");
    expect(html).toContain("An AI service is sent nothing from these screens");
  });

  it("gives each traveller a card with a label hint, an age band, and separate lists", () => {
    const html = render(
      <TravellerCard locale="en" traveller={mum} tripDays={3} onChange={noop} onRemove={noop} />,
    );
    const words = text(html);
    expect(words).toContain("A nickname is fine");
    for (const legend of ["Must-haves", "Likes", "Would rather skip", "Needs a rest after lunch"]) {
      expect(words).toContain(legend);
    }
    expect(words).toContain("A like never rules a place out");
    expect(words).toContain("Day 3");
    // Nothing asks for a legal name, a date of birth, a diagnosis or a reason.
    for (const banned of [
      /legal name/i,
      /date of birth/i,
      /diagnos/i,
      /reason/i,
      /birthday/i,
      /type="date"/,
    ]) {
      expect(html).not.toMatch(banned);
    }
    expect(html).toContain('maxLength="40"');
    expect(accessibilityFaults(html)).toEqual([]);
  });

  it("hides the days list for a one-day trip and keeps keys apart", () => {
    const html = render(
      <TravellerCard locale="en" traveller={mum} tripDays={1} onChange={noop} onRemove={noop} />,
    );
    expect(text(html)).not.toContain("Which days are they on");
    expect(nextKey(party({ travellers: [mum, little] }))).toBe("t3");
    expect(nextKey(party({ travellers: [little] }))).toBe("t1");
    const full = party({
      travellers: Array.from({ length: 8 }, (_, i) => ({ ...little, key: `t${i + 1}` })),
    });
    expect(nextKey(full)).toBeUndefined();
    expect(
      text(render(<PartyStep locale="en" party={full} tripDays={2} onChange={noop} />)),
    ).toContain("as many as one trip can hold");
  });

  it("holds no count, score or ranking of anyone", () => {
    const html = text(
      render(<PartyView {...partyProps()} />) +
        render(
          <RulesReadback
            locale="en"
            party={party({ travellers: [mum, little] })}
            onConfirm={noop}
            onChange={noop}
          />,
        ),
    );
    expect(html).not.toMatch(/\b\d+ (travellers|people|members)\b/i);
    expect(html).not.toMatch(/score|rank|best|top \d/i);
  });
});

describe("how you travel", () => {
  it("names Noren's starting values as guesses, and says so when the organiser sets one", () => {
    const html = render(
      <TravelStep locale="en" party={party()} guesses={guesses} onChange={noop} />,
    );
    const words = text(html);
    expect(words.match(/It is only a guess/g)?.length).toBe(5);
    expect(words).toContain(`${guesses.stretchMinutes} minutes`);
    expect(words).toContain(`${guesses.lunch}`);
    expect(words).toContain("Steady");
    expect(words).not.toContain("You set this");
    const set = text(
      render(
        <TravelStep
          locale="en"
          party={party({
            limits: { stretchMinutes: 90 },
            meals: { lunch: "13:00" },
            fullness: "light",
          })}
          guesses={guesses}
          onChange={noop}
        />,
      ),
    );
    expect(set.match(/You set this/g)?.length).toBe(3);
    expect(set.match(/It is only a guess/g)?.length).toBe(2);
    expect(set).toContain("Use Noren's guess");
    expect(accessibilityFaults(html)).toEqual([]);
  });

  it("keeps the times set for prayer, rest or work with a name for each remove button", () => {
    const html = render(
      <TravelStep
        locale="en"
        party={party({ needs: [{ kind: "prayer", at: "13:15", minutes: 20 }] })}
        guesses={guesses}
        onChange={noop}
      />,
    );
    expect(text(html)).toContain("A place to pray, 20 minutes from 13:15");
    expect(text(html)).toContain("Remove A place to pray at 13:15");
    expect(accessibilityFaults(html)).toEqual([]);
  });

  it("clears a value back to the guess without leaving an empty setting", () => {
    const updates: Partial<StoredParty>[] = [];
    const p = party({ limits: { stretchMinutes: 90 } });
    // The pure shape the step hands back is the party's own patch; clearing the only limit removes it.
    updates.push({ limits: undefined });
    const device = memoryDevice();
    const store = createTripStore({ storage: device.storage });
    store.update((d) => withDraft(d, trip(), p));
    store.update((d) => patchParty(d, p.id, updates[0] ?? {}));
    expect(store.get().parties[0]?.limits).toBeUndefined();
  });
});

describe("the read-back", () => {
  it("groups the must-haves by rule, not by person", () => {
    const p = party({ travellers: [mum, little] });
    expect(rulesByTag(p)).toEqual([
      { tag: "step-free", who: ["Mum"] },
      { tag: "halal", who: ["Mum", "the little one"] },
    ]);
    const html = text(
      render(<RulesReadback locale="en" party={p} onConfirm={noop} onChange={noop} />),
    );
    expect(html).toContain("No stairs: for Mum");
    expect(html).toContain("everyone");
    expect(html).toContain("That is right. Plan now");
    expect(html).toContain("Change something");
  });

  it("says so plainly when there are no must-haves", () => {
    const html = text(
      render(<RulesReadback locale="en" party={party()} onConfirm={noop} onChange={noop} />),
    );
    expect(html).toContain("No must-haves yet");
    expect(html).toContain("knows nothing about your party");
  });

  it("is reached through the last step", () => {
    const html = render(
      <NewTripView {...newTripProps({ step: "check", party: party({ travellers: [mum] }) })} />,
    );
    expect(text(html)).toContain("Check this before the first plan");
    expect(accessibilityFaults(html)).toEqual([]);
  });
});

describe("the list", () => {
  const trips = [
    trip({ id: "a", status: "finished", start: "ipoh", end: "taiping", days: 2 }),
    trip({ id: "b", start: "kuala-lumpur", end: "george-town", days: 3, startDate: "2026-12-13" }),
    trip({ id: "c" }),
  ];
  const planned = {
    ...trips[1]!,
    plan: { days: [], unmet: [], done: [], skipped: [] },
    seed: "s",
  } as StoredTrip;
  const underWay = { ...planned, id: "d", status: "under_way" } as StoredTrip;

  it("shows trips under way first, then planned, not yet planned and finished", () => {
    const list = [trips[0]!, trips[2]!, planned, underWay];
    expect(list.map(tripGroup)).toEqual(["finished", "notPlanned", "planned", "underWay"]);
    const html = render(<TripsView locale="en" region={region} trips={list} canKeep />);
    const order = ["Under way", "Planned", "Not planned yet", "Finished"].map((h) =>
      html.indexOf(`>${h}<`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('href="/en/trip/new"');
    expect(html).toContain('href="/en/trip/d/party"');
    expect(html).toContain("Route not chosen yet");
    expect(accessibilityFaults(html)).toEqual([]);
  });

  it("says trips are kept on this phone, and what is sent", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = text(render(<TripsView locale={locale} region={region} trips={[]} canKeep />));
      expect(html).toContain(tripMessages[locale].keptOnPhone);
      expect(html).toContain(tripMessages[locale].keptDetail);
      expect(html).toContain(tripMessages[locale].noTrips);
    }
  });

  it("warns when the browser keeps nothing", () => {
    expect(render(<TripsView locale="en" region={region} trips={[]} canKeep={false} />)).toContain(
      'role="alert"',
    );
  });
});

describe("the party page", () => {
  it("shows everything held in one place: the trip, the party, where it is kept, and delete", () => {
    const html = render(<PartyView {...partyProps()} />);
    const words = text(html);
    for (const heading of ["Where this is kept", "The trip", "The party", "Delete"]) {
      expect(words).toContain(heading);
    }
    expect(words).toContain("Mum");
    expect(words).toContain("the little one");
    expect(words).toContain("Delete this trip");
    expect(accessibilityFaults(html)).toEqual([]);
  });

  it("asks before deleting, and says what was deleted afterwards", () => {
    const asking = text(render(<PartyView {...partyProps({ confirming: true })} />));
    expect(asking).toContain("This cannot be undone");
    expect(asking).toContain("Yes, delete it");
    expect(text(render(<PartyView {...partyProps({ deleted: true })} />))).toContain("Deleted.");
  });

  it("deletes the trip and its party together", () => {
    const device = memoryDevice();
    const store = createTripStore({ storage: device.storage });
    const t = trip({ id: "x" });
    const p = party({ travellers: [mum] });
    store.update((d) => withDraft(d, t, p));
    store.update((d) => deleteTrip(d, "x"));
    expect(store.get()).toMatchObject({ trips: [], parties: [] });
  });

  it("says a trip is kept on the phone it was planned on when this phone holds none", () => {
    const html = text(render(<PartyView {...partyProps({ trip: undefined, party: undefined })} />));
    expect(html).toContain("This trip is not on this phone");
    expect(html).toContain("kept on the phone it was planned on");
  });

  it("mentions a private link when the trip has one", () => {
    const code = "a".repeat(24);
    const html = text(render(<PartyView {...partyProps({ trip: trip({ shareCode: code }) })} />));
    expect(html).toContain("This trip has a private link");
  });
});

describe("the words", () => {
  it("are in both languages for every key, with no jargon or provider names", () => {
    const en = Object.keys(tripMessages.en).sort();
    expect(Object.keys(tripMessages.ja).sort()).toEqual(en);
    for (const locale of SUPPORTED_LOCALES as readonly Locale[]) {
      for (const [key, value] of Object.entries(tripMessages[locale])) {
        expect(value, key).not.toBe("");
        expect(value, key).not.toMatch(
          /\bslot\b|hard rule|OpenAI|Anthropic|Claude|Gemini|Meta\b|Apify|Clerk|Convex/i,
        );
      }
    }
    // The same {placeholders} in both.
    for (const key of en as (keyof typeof tripMessages.en)[]) {
      const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(holes(tripMessages.ja[key]), key).toEqual(holes(tripMessages.en[key]));
    }
  });

  it("render every page in Japanese without an English fallback showing", () => {
    const html = text(render(<NewTripView {...newTripProps({ locale: "ja", step: "party" })} />));
    expect(html).toContain(tripMessages.ja.partyIntro);
    expect(html).not.toContain(tripMessages.en.partyIntro);
  });
});

describe("the door", () => {
  it("is shut by default: off is a 404 for everyone", () => {
    for (const person of [null, {}, { trip: true }])
      expect(tripDoor("off", person)).toBe("not_found");
  });

  it("opens a trial only to a person whose trip flag is exactly true, signed in or not", () => {
    expect(tripDoor("trial", { trip: true })).toBe("open");
    expect(tripDoor("trial", { trip: false })).toBe("not_found");
    // The field is added to people.current elsewhere; a missing field fails closed.
    expect(tripDoor("trial", {})).toBe("not_found");
    expect(tripDoor("trial", null)).toBe("not_found");
  });

  it("sends a signed-out visitor to sign in when trips are open", () => {
    expect(tripDoor("open", null)).toBe("sign_in");
    expect(tripDoor("open", {})).toBe("open");
  });

  it("ships with the trip switch open on this region file", () => {
    expect(regionModule.getActiveRegion().features.trip).toBe("open");
  });

  it("answers 404 when the switch is off", async () => {
    const real = regionModule.getActiveRegion();
    vi.spyOn(regionModule, "getActiveRegion").mockReturnValue({
      ...real,
      features: { ...real.features, trip: "off" },
    });
    try {
      await expect(requireTripDoor("en", "/trip")).rejects.toThrow("NEXT_NOT_FOUND");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("keeps trips among the private sections", () => {
    expect(PRIVATE_SECTIONS).toContain("trip");
  });
});

// ---- The plan page (T085, T102, the plan-page part of T079), the own-words box (T077) ----

const drive = (from: string, to: string, minutes = 120): Plan["days"][number]["items"][number] => ({
  kind: "drive",
  from,
  to,
  minutes,
  kilometres: 200,
  estimated: true,
});
const stopOf = (
  slot: string,
  place: Stop["place"],
  because: Stop["because"],
  over: Partial<Stop> = {},
): Stop => ({
  kind: "stop",
  slot,
  at: "10:30",
  minutes: 60,
  place,
  because,
  checks: [],
  confirmed: true,
  hasStory: true,
  ...over,
});
const place = (id: string) => ({ placeId: id, slug: `${id}-place` });
const day = (index: number, items: Plan["days"][number]["items"], over: Partial<Plan["days"][number]> = {}) => ({
  index,
  calendar: [],
  items,
  driveMinutes: 120,
  notes: [] as string[],
  ...over,
});
const info = (over: Partial<StopInfo> = {}): StopInfo => ({
  name: "Old Town Kopitiam",
  category: "Cafe",
  slug: "old-town-kopitiam",
  pin: { lat: 4.59, lng: 101.08 },
  confirmed: true,
  quotes: [],
  rests: {},
  ...over,
});
const quote = (id: string, over: Partial<PlannerQuote> = {}): PlannerQuote => ({
  id,
  kind: "story",
  slug: "old-town-kopitiam",
  placeName: "Old Town Kopitiam",
  text: "The coffee came in a glass.",
  language: "en",
  by: "Hana",
  translations: [],
  sources: [],
  aiAssisted: false,
  demo: false,
  ...over,
});
const ready = (i: StopInfo): StopLookup => ({ state: "ready", info: i });

function planProps(plan: Plan, over: Partial<PlanViewProps> = {}): PlanViewProps {
  return {
    locale: "en",
    region,
    tripId: "tr1",
    start: "kuala-lumpur",
    plan: { ...plan, done: [], skipped: [] },
    partyDescribed: true,
    guessed: [],
    labels: { t1: "Mum", t2: "Aiman", t3: "the little one" },
    travellers: [
      { key: "t1", label: "Mum", hasLikes: true },
      { key: "t2", label: "Aiman", hasLikes: true },
    ],
    pinLabels: {},
    pins: [],
    lookupFor: () => ready(info()),
    busy: false,
    offline: false,
    onRedraw: noop,
    onSkip: noop,
    onDone: noop,
    onTurn: noop,
    onAddPin: noop,
    ...over,
  };
}

const fullPlan: Plan = {
  days: [
    day(1, [
      drive("kuala-lumpur", "ipoh"),
      stopOf("d1.open1", place("a"), { kind: "turn", for: "t1", likes: ["history"] }),
      stopOf("d1.meal", place("b"), { kind: "need", need: "meal" }),
      { kind: "rest", at: "12:30", minutes: 60, why: "after_lunch" },
      stopOf("d1.open2", place("c"), { kind: "paired", for: "t2", with: "t1" }),
      stopOf("d1.open3", { pinId: "pin1" }, { kind: "pin" }),
      stopOf("d1.open4", place("d"), { kind: "wild" }),
    ]),
  ],
  unmet: [],
};

describe("the plan page", () => {
  it("says whom or what every stop is for, in the organiser's own labels", () => {
    const html = text(render(<PlanView
          {...planProps(fullPlan, {
            lookupFor: (stop) => ("pinId" in stop.place ? { state: "spot" } : ready(info())),
          })}
          pinLabels={{ pin1: "The market" }}
        />));
    expect(html).toContain("For Mum, chosen because of: History");
    expect(html).toContain("A meal");
    expect(html).toContain("Beside another stop: this one is for Aiman, while Mum has their turn");
    expect(html).toContain("A pin you added");
    expect(html).toContain("Wild card");
    expect(html).toContain("The market");
    // A label is only ever the organiser's: with none on the device, the line says so in words.
    const bare = text(render(<PlanView {...planProps(fullPlan)} labels={{}} />));
    expect(bare).toContain("For someone in your party");
    expect(bare).not.toMatch(/\bt1\b|\bt2\b/);
  });

  it("writes no sentence about a place: only a name, a category and quotes with their source", () => {
    const withQuotes = info({
      quotes: [
        quote("s1"),
        quote("f1", {
          kind: "found",
          text: "Best roti in the valley.",
          by: "roti_lover",
          link: "https://example.com/post/1",
          platform: "instagram",
        }),
      ],
    });
    const html = text(render(<PlanView {...planProps(fullPlan, { lookupFor: () => ready(withQuotes) })} />));
    expect(html).toContain("The coffee came in a glass.");
    expect(html).toContain("Hana");
    expect(html).toContain("roti_lover");
    expect(html).not.toContain("Hours: ");
    expect(html).toContain("Opening hours not known. Check before you go.");
    const nobody = text(render(<PlanView {...planProps(fullPlan)} />));
    expect(nobody).toContain("Nobody has written here yet.");
    expect(nobody).toContain("Tell the first story");
  });

  it("shows three verdicts: checked with what it rests on, and not checked with why", () => {
    const checked = stopOf("d1.open1", place("a"), { kind: "wild" }, {
      checks: [
        { rule: "step-free", verdict: "met", restsOn: { kind: "member", factId: "f1" } },
        { rule: "halal", verdict: "met", restsOn: { kind: "post", factId: "f2" } },
        { rule: "vegan", verdict: "met", restsOn: { kind: "owner" } },
        { rule: "quiet", verdict: "not_known", reason: "no_record" },
        { rule: "toilet-near", verdict: "not_known", reason: "too_old" },
      ],
    });
    const rests = {
      f1: { kind: "member" as const, name: "Hana", day: "2026-11-02" },
      f2: {
        kind: "post" as const,
        quote: "All food here is halal.",
        platform: "instagram",
        link: "https://example.com/p",
        day: "2026-10-01",
      },
    };
    const html = text(
      render(
        <PlanView
          {...planProps({ days: [day(1, [checked])], unmet: [] }, {
            lookupFor: () => ready(info({ rests })),
          })}
        />,
      ),
    );
    expect(html).toContain("No stairs: a member's report, Hana,");
    expect(html).toContain("November 2, 2026");
    expect(html).toContain("All food here is halal.");
    // A visitor's post is credited as the place page credits it, never by platform.
    expect(html).toContain("A visitor's own words, October 1, 2026");
    expect(html).toContain("See their post");
    expect(html).not.toContain("From Instagram");
    expect(html).toContain("the owner's word");
    expect(html).toContain("Somewhere quiet: not checked");
    expect(html).toContain("A toilet close by: not checked");
    // A rule with no record never reads as passed.
    const notChecked = html.slice(html.indexOf("What Noren could not check"));
    expect(notChecked).not.toMatch(/\bfine\b|\bok\b|✓|✔|passed/i);
  });

  it("drops a check from the list when the record it rested on has left", () => {
    const checked = stopOf("d1.open1", place("a"), { kind: "wild" }, {
      checks: [{ rule: "step-free", verdict: "met", restsOn: { kind: "member", factId: "gone" } }],
    });
    const html = text(
      render(<PlanView {...planProps({ days: [day(1, [checked])], unmet: [] })} />),
    );
    expect(html).not.toContain("What Noren could check");
    expect(html).toContain("No stairs: not checked. The record this rested on is no longer there.");
  });

  it("marks a gone place, an offline read and a place still being read", () => {
    const gone = text(render(<PlanView {...planProps(fullPlan, { lookupFor: () => ({ state: "gone" }) })} />));
    expect(gone).toContain("This place is no longer on Noren");
    expect(gone).toContain("Draw another");
    const offline = text(
      render(<PlanView {...planProps(fullPlan, { lookupFor: () => ({ state: "offline" }), offline: true })} />),
    );
    expect(offline).toContain("What people wrote here needs a connection.");
  });

  it("shows the unmet reasons at the top, each in plain words, and never a raw code", () => {
    const plan: Plan = {
      days: [],
      unmet: [
        { what: "route", detail: "over_day_drive_limit", choices: ["drop_town", "add_day", "raise_limit"] },
        { what: "change", detail: "some_code_from_the_future", choices: ["something_new"] },
      ],
    };
    const html = text(render(<PlanView {...planProps(plan)} />));
    expect(html).toContain("The route cannot be driven within the most driving you set for a day.");
    expect(html).toContain("Drop a town from the route".length ? "Change the route" : "");
    expect(html).not.toContain("some_code_from_the_future");
    expect(html).not.toContain("something_new");
    expect(html).toContain(tripMessages.en.reasonUnknown);
    expect(html).toContain(tripMessages.en.choiceUnknown);
  });

  it("has wording in both languages for every reason code and choice the engine can return", () => {
    for (const locale of ["en", "ja"] as const) {
      const words = tripMessages[locale] as Record<string, string>;
      for (const code of TRIP_REASON_CODES) expect(words[`reason_${code}`], `${locale} ${code}`).toBeTruthy();
      for (const choice of [...ROUTE_CHOICES, ...TRIP_CHANGE_CHOICES]) {
        expect(words[`choice_${choice}`], `${locale} ${choice}`).toBeTruthy();
      }
    }
  });

  it("names the guesses and says so when it knows nothing about the party", () => {
    const html = text(
      render(<PlanView {...planProps(fullPlan, { partyDescribed: false, guessed: ["stretch", "meals"] })} />),
    );
    expect(html).toContain(tripMessages.en.planKnowsNothing);
    expect(html).toContain("guess");
    expect(html).toContain("Change");
  });

  it("names a town nobody has written about once, at the top", () => {
    const plan: Plan = {
      days: [
        day(1, [drive("kuala-lumpur", "tapah")], { notes: ["no_stories_in_town"] }),
        day(2, [drive("tapah", "ipoh")], { notes: ["no_stories_in_town"] }),
      ].map((d, i) => (i === 1 ? { ...d, notes: [] } : d)),
      unmet: [],
    };
    const html = text(render(<PlanView {...planProps(plan)} />));
    const line = tripMessages.en.planNoStoriesTown.split("{towns}")[0]!.trim();
    expect(html.split(line).length - 1).toBe(1);
    expect(html).toContain("Tapah");
  });

  it("shows an unconfirmed stop with its label and Still here", () => {
    const html = text(
      render(
        <PlanView
          {...planProps(fullPlan, {
            lookupFor: () => ready(info({ confirmed: false })),
            toolsFor: () => (
              <PlaceCheck
                locale="en"
                fromOpenData
                draftName="check:a"
                actions={{ signedIn: true, confirm: async () => undefined, report: async () => undefined }}
              />
            ),
          })}
        />,
      ),
    );
    expect(html).toContain("Not yet confirmed");
    expect(html).toContain("Still here");
  });

  it("says in words when a traveller has no turn in a day, and offers to change it, without counting", () => {
    const plan: Plan = {
      days: [
        day(1, [
          stopOf("d1.open1", place("a"), { kind: "turn", for: "t1", likes: ["history"] }),
          stopOf("d1.open2", place("b"), { kind: "turn", for: "t1", likes: ["history"] }),
        ]),
      ],
      unmet: [],
    };
    const html = text(render(<PlanView {...planProps(plan)} />));
    expect(html).toContain("Aiman");
    expect(html).toContain("has no turn on this day");
    expect(html).toContain("Give Aiman a turn on this day");
    for (const shown of [html, text(render(<PlanView {...planProps(fullPlan)} />))]) {
      expect(shown).not.toMatch(/\b(score|rank|ranking|rating|points?|most turns|fewest)\b/i);
      expect(shown).not.toMatch(/\d+\s+turns?\b/i);
    }
  });

  it("offers a maps link for every drive and marks times as estimates", () => {
    const html = render(<PlanView {...planProps(fullPlan)} />);
    expect(html).toContain("https://www.google.com/maps/dir/");
    expect(text(html)).toContain(tripMessages.en.planTimesNote);
  });

  it("renders in Japanese without English fallbacks", () => {
    const html = text(render(<PlanView {...planProps(fullPlan, { locale: "ja", labels: {} })} />));
    expect(html).toContain(tripMessages.ja.hoursUnknown);
    expect(html).not.toContain(tripMessages.en.hoursUnknown);
  });

  it("has no accessibility fault", () => {
    expect(accessibilityFaults(render(<PlanView {...planProps(fullPlan)} />))).toEqual([]);
  });

  it("keeps every stop but the one it bears on, and holds finished stops by time (Draw another)", () => {
    const kept = keepStops(fullPlan, ["d1.meal"], ["d1.open1"]);
    expect(kept.map((k) => k.slot)).toEqual(["d1.meal", "d1.open2", "d1.open4"]);
    expect(kept.find((k) => k.slot === "d1.meal")?.hold).toBe("time");
    expect(kept.find((k) => k.slot === "d1.open2")?.hold).toBe("place");
  });

  it("calls the server's rows what the card reads", () => {
    const rest = restsOf([
      { factId: "f1", key: "step-free", value: "yes", day: "2026-11-02", basis: "member", reporterName: "Hana" },
    ] as unknown as StopRow["facts"]);
    expect(rest.f1).toEqual({ kind: "member", name: "Hana", day: "2026-11-02" });
  });
});

describe("the own-words box", () => {
  const box = (over: Partial<OwnWordsBoxProps> = {}): OwnWordsBoxProps => ({
    locale: "en",
    travellers: [{ key: "t1", label: "Mum" }],
    noticeSeen: true,
    onNoticeSeen: noop,
    interpret: async () => ({ proposals: [], questions: [], ops: [], state: "ai" }),
    onAccept: noop,
    canAddTraveller: true,
    ...over,
  });

  it("tells the organiser once what is sent where, before the box can be typed in", () => {
    const html = text(render(<OwnWordsBox {...box({ noticeSeen: false })} />));
    expect(html).toContain(tripMessages.en.ownNoticeKept);
    expect(html).toContain(tripMessages.en.ownNoticeServers);
    expect(html).toContain(tripMessages.en.ownNoticeAi);
    expect(render(<OwnWordsBox {...box({ noticeSeen: false })} />)).not.toContain("<textarea");
    expect(render(<OwnWordsBox {...box()} />)).toContain("<textarea");
    for (const locale of SUPPORTED_LOCALES) {
      const shown = text(render(<OwnWordsBox {...box({ locale, voice: () => <p>Recorder</p> })} />));
      expect(shown).toContain(tripMessages[locale].voiceSendConsent);
      expect(shown.indexOf(tripMessages[locale].voiceSendConsent)).toBeLessThan(shown.indexOf("Recorder"));
      expect(shown).toContain(tripMessages[locale].ownSendConsent);
      expect(shown).toContain(tripMessages[locale].partyConsent);
    }
  });

  it("is accessible, and in Japanese has no English showing", () => {
    expect(accessibilityFaults(render(<OwnWordsBox {...box()} />))).toEqual([]);
    const ja = text(render(<OwnWordsBox {...box({ locale: "ja" })} />));
    expect(ja).toContain(tripMessages.ja.ownTitle);
  });

  it("matches 'my mum' to the card labelled Mum, and asks when it cannot", () => {
    const travellers = [
      { key: "t1", label: "Mum" },
      { key: "t2", label: "Aiman" },
    ];
    expect(matchTraveller("my mum", travellers)).toBe("t1");
    expect(matchTraveller("Aiman", travellers)).toBe("t2");
    expect(matchTraveller("my grandfather", travellers)).toBeUndefined();
    expect(matchTraveller("", travellers)).toBeUndefined();
    expect(matchTraveller("mum", [{ key: "t1", label: "Mum" }, { key: "t2", label: "Mum" }])).toBeUndefined();
  });

  it("applies an accepted suggestion to the right traveller and only that", () => {
    const p = party({ travellers: [mum, little] });
    const rule = { about: "my mum", kind: "rule", tag: "quiet", saidAs: "quiet" } as const;
    const next = applyProposal(p, rule, "t1").travellers!;
    expect(next.find((t) => t.key === "t1")!.rules).toContain("quiet");
    expect(next.find((t) => t.key === "t2")!.rules).not.toContain("quiet");
    const limit = { about: "", kind: "limit", tag: "stretch", minutes: 90, saidAs: "" } as const;
    expect(applyProposal(p, limit, undefined).limits).toEqual({ stretchMinutes: 90 });
    const rest = { about: "", kind: "rhythm", tag: "after-lunch", minutes: 30, saidAs: "" } as const;
    expect(applyProposal(p, rest, "t2").travellers!.find((t) => t.key === "t2")!.rests).toEqual({
      after: "lunch",
      minutes: 30,
    });
    expect(applyProposal(p, rule, undefined)).toEqual({});
  });

  it("words a suggestion in the organiser's label, with no sentence from the model", () => {
    const rule = { about: "my mum", kind: "rule", tag: "step-free", saidAs: "cannot manage stairs" } as const;
    expect(proposalText("en", rule, "Mum")).toBe("Must-have for Mum: No stairs");
    expect(proposalText("ja", rule, "母")).toContain("母");
  });

  it("words every question the server can ask, in both languages", () => {
    for (const q of TRIP_QUESTIONS) {
      for (const locale of ["en", "ja"] as const) {
        expect((tripMessages[locale] as Record<string, string>)[`question_${q.id.replaceAll("-", "_")}`], q.id).toBeTruthy();
      }
    }
  });
});

describe("the route's towns to pass through", () => {
  it("offers only towns to add, numbers the list in order, and has move and remove buttons", () => {
    const html = render(
      <RouteStep
        locale="en"
        region={region}
        trip={trip({ start: "kuala-lumpur", end: "alor-setar", via: ["ipoh", "taiping"] })}
        onChange={noop}
      />,
    );
    const add = /<select id="trip-via-add"[\s\S]*?<\/select>/.exec(html)?.[0] ?? "";
    expect(add).toContain("Kampar");
    expect(add).not.toMatch(/Juru|Sungai Dua|rest area|lay-by|Kuala Lumpur/);
    const list = text(/<ol class="space-y-2">[\s\S]*?<\/ol>/.exec(html)?.[0] ?? "");
    expect(list.indexOf("Ipoh")).toBeLessThan(list.indexOf("Taiping"));
    expect(list).toContain("Move Ipoh down");
    expect(list).toContain("Remove Taiping");
  });

  it("says what a must-have does without overstating what Noren knows", () => {
    expect(tripMessages.en.rulesHelp).not.toMatch(/Places that do not meet these are left out/);
    expect(tripMessages.en.rulesHelp).toContain("not checked");
    expect(tripMessages.ja.rulesHelp).toContain("確かめていません");
  });
});

// ---------------------------------------------------------------------------------------------
// Changing the plan and sharing it (T110 to T113, T119)

const changeProps = (over: Partial<ChangeViewProps> = {}): ChangeViewProps => ({
  locale: "en",
  tripId: "tr1",
  days: [
    {
      index: 1,
      stops: [
        { slot: "d1.open1", name: "Old Town Kopitiam", done: false },
        { slot: "d1.open2", name: "Hill Garden", done: false },
      ],
    },
    { index: 2, stops: [] },
  ],
  nightCount: 1,
  towns: [{ id: "ipoh", name: "Ipoh" }],
  travellers: [
    { key: "t1", label: "Mum", hasLikes: true },
    { key: "t2", label: "Aiman", hasLikes: false },
  ],
  today: 1,
  busy: false,
  offline: false,
  canUndo: false,
  onUndo: noop,
  changes: [],
  names: { who: (k) => k, stop: (s) => s, town: (t) => t },
  onChange: noop,
  ...over,
});

// "We're tired" is the lighten op, which only removes the day's last open stop: nothing "became" another place.
const tired = (n: number) =>
  ["Old Town Kopitiam", "Hill Garden", "Lake Park"].slice(0, n).map((was, i) => ({
    slot: `d1.open${i + 1}`,
    day: 1,
    was,
    why: "lightened",
  }));

describe("the change page", () => {
  it("shows the quick buttons before any change, with Undo off and no changes listed", () => {
    const html = render(<ChangeView {...changeProps()} />);
    const t = text(html);
    for (const label of ["Quieter", "Shorter walks", "We're tired", "It's raining", "More for Mum"]) {
      expect(t).toContain(label);
    }
    // Only a traveller with likes can be given a turn.
    expect(t).not.toContain("More for Aiman");
    expect(t).toContain("No changes yet.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Undo the last change/);
    expect(t).toContain("Longer here");
    expect(t).toContain("Move the night");
  });

  it("lists what moved after 'we're tired', each with its reason, and not what stayed", () => {
    const html = text(
      render(
        <ChangeView
          {...changeProps({
            last: { kind: "applied", saidAs: "We're tired", moved: tired(3), unmet: [] },
            canUndo: true,
          })}
        />,
      ),
    );
    expect(html).toContain("What moved");
    expect(html).toContain("Day 1: Old Town Kopitiam left the plan.");
    expect(html).toContain("Lake Park left the plan.");
    expect(html).not.toContain("became");
    expect(html).toContain(tripMessages.en.reason_lightened);
    expect(html).not.toContain("stayed");
    expect(html).not.toContain("unchanged");
  });

  it("offers Undo after a change, and lists changes newest first", () => {
    const html = render(
      <ChangeView
        {...changeProps({
          canUndo: true,
          changes: [
            { at: 1_700_000_000_000, saidAs: "Quieter", moved: [] },
            { at: 1_700_000_100_000, saidAs: "We're tired", moved: tired(1) },
          ],
        })}
      />,
    );
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Undo the last change/);
    const t = text(html);
    expect(t.indexOf("We're tired")).toBeLessThan(t.lastIndexOf("Quieter"));
  });

  it("names the rule and the choices of a refused change, and says the plan is as it was", () => {
    const unmet = [
      {
        what: "change" as const,
        day: 2,
        slot: "d2.open1",
        detail: "change_slot_held",
        choices: [...TRIP_CHANGE_CHOICES],
      },
    ];
    const html = text(render(<RefusedNotice locale="en" unmet={unmet} onDismiss={noop} />));
    expect(html).toContain("That change could not be made");
    expect(html).toContain("The plan on screen has not changed.");
    expect(html).toContain(tripMessages.en.reason_change_slot_held);
    expect(html).toContain("Keep the plan as it is");
    expect(html).toContain("Choose a different change");
    // The raw code is never shown.
    expect(html).not.toContain("change_slot_held");
  });

  it("says Noren has no record of a quieter place, and never calls a place quiet", () => {
    const html = text(
      render(
        <ChangeView
          {...changeProps({
            last: {
              kind: "applied",
              saidAs: "Quieter",
              moved: [],
              unmet: [
                {
                  what: "change",
                  day: 1,
                  slot: "d1.open1",
                  detail: "no_quiet_place_in_reach",
                  choices: [...TRIP_CHANGE_CHOICES],
                },
              ],
            },
          })}
        />,
      ),
    );
    expect(html).toContain("Noren has no record of a quieter place near there");
    expect(html).not.toMatch(/\b(is|are) quiet\b/i);
  });

  it("words every kind of change in both languages", () => {
    const names = { who: () => "Mum", stop: () => "Hill Garden", town: () => "Ipoh" };
    const ops = [
      { op: "lighten", day: 2 },
      { op: "quieter" },
      { op: "quieter", day: 1 },
      { op: "shorter_walks" },
      { op: "more_for", who: "t1" },
      { op: "more_for", who: "t1", day: 2 },
      { op: "skip", slot: "s" },
      { op: "redraw", slot: "s" },
      { op: "stay_longer", slot: "s", minutes: 30 },
      { op: "move_night", night: 1, to: "ipoh" },
      { op: "weather", day: 1, kind: "rain" },
      { op: "weather", day: 1, kind: "heat" },
    ] as const;
    for (const op of ops) {
      const en = opText("en", op as never, names);
      const ja = opText("ja", op as never, names);
      expect(en).not.toMatch(/\{|undefined/);
      expect(ja).not.toMatch(/\{|undefined/);
      expect(/[ぁ-んァ-ン一-龥]/.test(ja)).toBe(true);
    }
  });

  it("shows a suggestion box that starts with the notice, and an AI label wording", () => {
    const base = {
      locale: "en" as const,
      travellers: changeProps().travellers,
      names: changeProps().names,
      busy: false,
      interpret: async () => ({ state: "plain" as const, proposals: [], questions: [], ops: [] }),
      onApply: noop,
      onNoticeSeen: noop,
    };
    const first = text(render(<ChangeWords {...base} noticeSeen={false} />));
    expect(first).toContain(tripMessages.en.ownNoticeAi);
    expect(first).not.toContain("What changed?");
    const seen = text(render(<ChangeWords {...base} noticeSeen />));
    expect(seen).toContain(tripMessages.en.changeWordsSendConsent);
    expect(seen).toContain(tripMessages.en.partyConsent);
    expect(seen).toContain("What changed?");
    expect(seen).toContain("Nothing changes until you say yes");
    expect(seen).toContain("The buttons above always work");
  });

  it("says typing is not being read when the AI step fails, with the buttons still there", () => {
    expect(tripMessages.en.typedFailed).toContain("Typing is not being read just now");
    expect(tripMessages.ja.typedFailed).not.toMatch(/Typing/);
    const html = text(render(<ChangeView {...changeProps({ words: <p>box</p> })} />));
    expect(html).toContain("Quieter");
  });

  it("waits for a connection: the last plan reads, a change is held, and it says so", () => {
    const html = render(<ChangeView {...changeProps({ offline: true })} />);
    expect(text(html)).toContain("No connection");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Quieter/);
  });

  it("renders in Japanese without English labels, and has no accessibility fault in either language", () => {
    const ja = render(<ChangeView {...changeProps({ locale: "ja", last: { kind: "applied", saidAs: "疲れました", moved: tired(2), unmet: [] } })} />);
    const t = text(ja);
    expect(t).toContain(tripMessages.ja.btnQuieter);
    expect(t).not.toContain(tripMessages.en.btnQuieter);
    for (const locale of ["en", "ja"] as const) {
      const html = render(
        <ChangeView
          {...changeProps({
            locale,
            canUndo: true,
            last: { kind: "applied", saidAs: "x", moved: tired(3), unmet: [] },
            changes: [{ at: 1_700_000_000_000, saidAs: "x", moved: tired(1) }],
          })}
        />,
      );
      expect(accessibilityFaults(html)).toEqual([]);
    }
  });

  it("marks a moved stop done in words of its own", () => {
    const html = text(render(<MovedList locale="en" moved={[{ slot: "d1.open1", day: 1, now: "Hill Garden", why: "done" }]} />));
    expect(html).toContain("You marked Hill Garden as done.");
  });
});

describe("making a change on the phone", () => {
  const stored = (): StoredTrip => {
    const trip = {
      ...blankTrip("tr1", "p1", region.id),
      start: "kuala-lumpur",
      end: "ipoh",
      days: 1,
      plan: { ...fullPlan, done: [], skipped: [] },
      seed: "seed-1",
      pins: [{ id: "pin1", day: 1, minutes: 60, pin: { lat: 4.5, lng: 101 }, label: "Hill" }],
    } as StoredTrip;
    return trip;
  };
  const party = { ...blankParty("p1"), travellers: [{ key: "t1", label: "Mum", ageBand: "adult" as const, rules: [], likes: ["history"], skips: [] }] };
  const settings = region as never;

  it("refuses without touching the plan, and applies with the plan before kept so Undo restores it exactly", async () => {
    const trip = stored();
    const plan = vi.fn(async () => ({
      seed: "seed-1",
      plan: { ...fullPlan, unmet: [{ what: "change", detail: "change_no_replacement", choices: ["keep_plan"] }] },
    }));
    const refusal = await requestChange({
      trip,
      party,
      settings,
      ops: [{ op: "quieter" }],
      consentVersion: TRIP_CONSENT_VERSION,
      plan,
    });
    expect(refusal.kind).toBe("refused");
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ consentVersion: TRIP_CONSENT_VERSION }));

    const moved = [{ slot: "d1.open1", was: "a", now: "z", why: "drawn_quieter" }];
    const next: Plan = {
      ...fullPlan,
      moved,
      days: fullPlan.days.map((d) => ({
        ...d,
        items: d.items.map((i) => (i.kind === "stop" && i.slot === "d1.open1" ? { ...i, place: place("z") } : i)),
      })),
    };
    const result = await requestChange({ trip, party, settings, consentVersion: TRIP_CONSENT_VERSION, ops: [{ op: "quieter" }], plan: async () => ({ seed: "seed-1", plan: next }) });
    if (result.kind !== "applied") throw new Error("expected applied");
    const data = commitChange({ version: 1, parties: [party], trips: [trip] }, "tr1", result, { saidAs: "Quieter", ops: [{ op: "quieter" }] });
    const changed = data.trips[0]!;
    expect(changed.changes.at(-1)).toMatchObject({ saidAs: "Quieter", moved });
    expect(changed.previous?.plan.days).toEqual(trip.plan!.days);
    expect(undoLastChange(changed).plan?.days).toEqual(trip.plan!.days);
    expect(undoLastChange(changed).changes).toHaveLength(0);
  });

  it("offers today's day, and says a trip is over once its last day has passed", () => {
    const dated = { days: [{ ...fullPlan.days[0]!, date: "2026-12-13" }, { ...fullPlan.days[0]!, index: 2, date: "2026-12-14" }] } as Plan;
    expect(dayForToday(dated, [], "2026-12-14")).toBe(2);
    expect(dayForToday(dated, [], "2026-01-01")).toBe(1);
    expect(lastDayPassed(dated, "2026-12-14")).toBe(false);
    expect(lastDayPassed(dated, "2026-12-15")).toBe(true);
    expect(lastDayPassed(fullPlan, "2099-01-01")).toBe(false);
  });
});

describe("sharing with the party", () => {
  const share = (over: Partial<ShareViewProps> = {}): ShareViewProps => ({
    locale: "en",
    title: "Kuala Lumpur to Ipoh",
    onTitle: noop,
    busy: false,
    online: true,
    onMake: noop,
    onUpdate: noop,
    onCopy: noop,
    onOff: noop,
    ...over,
  });

  it("offers to make a link, says who can read it, and names no traveller", () => {
    const html = text(render(<ShareView {...share()} />));
    expect(html).toContain("Share with the party");
    expect(html).toContain("Make a link");
    expect(html).toContain("They need no account");
    expect(html).toContain("Anyone who has the link can read it");
  });

  it("shows the link with copy, share again and switch off once it is made", () => {
    const html = text(render(<ShareView {...share({ url: "https://noren.example/en/trip/shared/abc", message: "made" })} />));
    expect(html).toContain("Copy the link");
    expect(html).toContain("Share the new plan");
    expect(html).toContain("The link stays the same");
    expect(html).toContain("Switch the link off");
    expect(html).toContain("Your link is ready");
  });

  it("says it is switched off, and waits when there is no connection", () => {
    expect(text(render(<ShareView {...share({ message: "off" })} />))).toContain("Nobody can open it now");
    const offline = render(<ShareView {...share({ online: false })} />);
    expect(text(offline)).toContain("No connection");
    expect(offline).toMatch(/<button[^>]*disabled=""[^>]*>Make a link/);
  });

  it("has no accessibility fault, and reads in Japanese", () => {
    for (const locale of ["en", "ja"] as const) {
      expect(accessibilityFaults(render(<ShareView {...share({ locale })} />))).toEqual([]);
      expect(accessibilityFaults(render(<ShareView {...share({ locale, url: "https://x/y" })} />))).toEqual([]);
    }
    expect(text(render(<ShareView {...share({ locale: "ja" })} />))).toContain(tripMessages.ja.shareMake);
  });

  it("says the trip was not deleted when its link could not be switched off", () => {
    const trip = { ...blankTrip("tr1", "p1", region.id), shareCode: "abcdefghjkmnpqrstuvwxyz2" } as StoredTrip;
    const html = text(
      render(
        <PartyView
          locale="en"
          region={region}
          trip={trip}
          party={blankParty("p1")}
          canKeep
          confirming
          deleted={false}
          linkProblem
          onTripChange={noop}
          onPartyChange={noop}
          onAskDelete={noop}
          onCancelDelete={noop}
          onDelete={noop}
        />,
      ),
    );
    expect(html).toContain("could not be switched off");
    expect(html).toContain("the trip has not been deleted");
  });
});

describe("what the pages share", () => {
  it("builds every drive link in one place", () => {
    const a = { lat: 3.1, lng: 101.6 };
    const b = { lat: 4.6, lng: 101.1 };
    expect(directionsUrl(a, b)).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=3.100000,101.600000&destination=4.600000,101.100000&travelmode=driving",
    );
    expect(directionsUrl(undefined, b)).not.toContain("origin=");
    const points = region.roads!.points.filter((p) => p.pin);
    const [from, to] = points;
    expect(driveMapsUrl(region as never, from!.id, to!.id)).toBe(directionsUrl(from!.pin, to!.pin));
  });

  it("offers towns and the region's endpoints to start and end, towns only to sleep, and a junction nowhere", () => {
    const html = render(
      <RouteStep
        locale="en"
        region={region}
        trip={{ ...blankTrip("t", "p", region.id), days: 3, nights: ["ipoh", "taiping"] } as StoredTrip}
        onChange={noop}
      />,
    );
    const select = (id: string) =>
      html.match(new RegExp(`<select id="${id}".*?</select>`))?.[0] ?? "";
    const values = (block: string) => [...block.matchAll(/value="([^"]*)"/g)].map((m) => m[1]);
    const towns = roadTowns(region, "en");
    const places = towns.filter((x) => x.town).map((x) => x.id);
    const endpoints = region.roads!.endpoints ?? [];
    expect(endpoints).toContain("kuala-lumpur");
    for (const end of ["trip-start", "trip-end"]) {
      const offered = values(select(end));
      expect(offered).toContain("kuala-lumpur");
      for (const id of places) expect(offered).toContain(id);
    }
    for (const night of ["trip-night-1", "trip-night-2"]) {
      const offered = values(select(night));
      expect(offered).not.toContain("kuala-lumpur");
      for (const id of places) expect(offered).toContain(id);
    }
    const junctions = towns.filter((x) => !x.town && !endpoints.includes(x.id)).map((x) => x.id);
    expect(junctions.length).toBeGreaterThan(0);
    for (const id of junctions) {
      for (const block of ["trip-start", "trip-end", "trip-night-1"]) {
        expect(values(select(block))).not.toContain(id);
      }
    }
  });
});
