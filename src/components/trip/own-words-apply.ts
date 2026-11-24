import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { TripProposal } from "@/lib/trip/interpret";
import type { StoredParty } from "@/lib/trip/storage";
import { ruleTagLabel, TRIP_TASTES } from "@/lib/trip/vocabulary";

// Turning what the organiser accepted into the party on the device. Pure: nothing here talks to a
// server or writes anywhere; the container hands the result to the store.

export type Who = { key: string } | { fresh: string };

type Named = { key: string; label: string };

/** Words that only point at a person ("my mum", "the little one"); they are not part of a label. */
const LEAD = /^(my|our|the|a|an)\s+/i;

function plain(text: string): string {
  return text.trim().toLowerCase().replace(LEAD, "").replace(/[.!?。]+$/, "").trim();
}

/**
 * The traveller the organiser's words point at ("my mum" for the card labelled "Mum"), or
 * undefined when none, or more than one, fits. The page asks when this is undefined.
 */
export function matchTraveller(about: string, travellers: readonly Named[]): string | undefined {
  const target = plain(about);
  if (target === "") return undefined;
  const labelled = travellers.filter((t) => plain(t.label) !== "");
  const exact = labelled.filter((t) => plain(t.label) === target);
  if (exact.length === 1) return exact[0]!.key;
  if (exact.length > 1) return undefined;
  const near = labelled.filter((t) => plain(t.label).includes(target) || target.includes(plain(t.label)));
  return near.length === 1 ? near[0]!.key : undefined;
}

/** Whether a suggestion is about one traveller. A limit is about the whole party. */
export function needsTraveller(proposal: Pick<TripProposal, "kind">): boolean {
  return proposal.kind !== "limit";
}

const add = (list: string[], tag: string, max: number) =>
  list.includes(tag) || list.length >= max ? list : [...list, tag];

/** The party after an accepted suggestion. A traveller that is not there yet is added by the caller. */
export function applyProposal(
  party: StoredParty,
  proposal: TripProposal,
  key: string | undefined,
): Partial<StoredParty> {
  if (proposal.kind === "limit") {
    const minutes = proposal.minutes;
    if (minutes === undefined) return {};
    if (proposal.tag === "stretch") return { limits: { ...party.limits, stretchMinutes: minutes } };
    if (proposal.tag === "dayDrive") return { limits: { ...party.limits, dayDriveMinutes: minutes } };
    return {};
  }
  if (key === undefined) return {};
  const next = party.travellers.map((t) => {
    if (t.key !== key) return t;
    switch (proposal.kind) {
      case "rule":
        return { ...t, rules: add(t.rules, proposal.tag, 8) };
      case "like":
        return { ...t, likes: add(t.likes, proposal.tag, 8) };
      case "skip":
        return { ...t, skips: add(t.skips, proposal.tag, 4) };
      case "rhythm":
        return proposal.minutes === undefined
          ? t
          : { ...t, rests: { after: "lunch" as const, minutes: proposal.minutes } };
      default:
        return t;
    }
  });
  return { travellers: next };
}

/** One suggestion in a sentence, in the organiser's labels. Nothing is written by the model. */
export function proposalText(locale: Locale, proposal: TripProposal, who: string): string {
  const m = messagesFor(tripMessages, locale);
  const taste = TRIP_TASTES.find((t) => t.tag === proposal.tag)?.label[locale] ?? proposal.tag;
  switch (proposal.kind) {
    case "rule":
      return format(m.ownRuleFor, { who, rule: ruleTagLabel(proposal.tag, locale) });
    case "like":
      return format(m.ownLikeFor, { who, taste });
    case "skip":
      return format(m.ownSkipFor, { who, taste });
    case "rhythm":
      return format(m.ownRestFor, { who, minutes: proposal.minutes ?? 0 });
    case "limit":
      return format(proposal.tag === "stretch" ? m.ownLimitStretch : m.ownLimitDayDrive, {
        minutes: proposal.minutes ?? 0,
      });
  }
}
