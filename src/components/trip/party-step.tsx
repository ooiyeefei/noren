"use client";

import { messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredParty } from "@/lib/trip/storage";
import { buttonClass, helpClass } from "./route-step";
import { TravellerCard } from "./traveller-card";

const MAX_TRAVELLERS = 8;

/** The first key t1 to t8 not in use, so a key is never reused while its traveller is on the list. */
export function nextKey(party: StoredParty): string | undefined {
  const used = new Set(party.travellers.map((t) => t.key));
  return Array.from({ length: MAX_TRAVELLERS }, (_, i) => `t${i + 1}`).find(
    (key) => !used.has(key),
  );
}

/** Where the description is kept and what is sent, said where the party is first described. */
export function PartyKeeps({ locale }: { locale: Locale }): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  return <p className="max-w-prose rounded-[10px] bg-kamenozoki p-4 text-[15px]">{m.keptDetail}</p>;
}

export function PartyStep({
  locale,
  party,
  tripDays,
  onChange,
}: {
  locale: Locale;
  party: StoredParty;
  tripDays: number;
  onChange(patch: Partial<StoredParty>): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const key = nextKey(party);
  const add = () => {
    if (key === undefined) return;
    onChange({
      travellers: [
        ...party.travellers,
        { key, label: "", ageBand: "adult", rules: [], likes: [], skips: [] },
      ],
    });
  };
  const remove = (gone: string) =>
    onChange({
      travellers: party.travellers.filter((t) => t.key !== gone),
      // A time kept for someone who left is dropped from their list, and with it when it was theirs alone.
      needs: party.needs.flatMap((need) => {
        if (!need.who?.includes(gone)) return [need];
        const who = need.who.filter((k) => k !== gone);
        return who.length > 0 ? [{ ...need, who }] : [];
      }),
    });
  return (
    <div className="space-y-5">
      <h2 className="font-sans text-[22px] font-bold">{m.partyIntro}</h2>
      <p className="max-w-prose">{m.partyHelp}</p>
      <PartyKeeps locale={locale} />
      {party.travellers.length === 0 && <p>{m.partyNothing}</p>}
      <div className="space-y-4">
        {party.travellers.map((traveller) => (
          <TravellerCard
            key={traveller.key}
            locale={locale}
            traveller={traveller}
            tripDays={tripDays}
            onChange={(next) =>
              onChange({ travellers: party.travellers.map((t) => (t.key === next.key ? next : t)) })
            }
            onRemove={() => remove(traveller.key)}
          />
        ))}
      </div>
      {key === undefined ? (
        <p className={helpClass}>{m.travellersFull}</p>
      ) : (
        <button type="button" className={buttonClass} onClick={add}>
          {m.addTraveller}
        </button>
      )}
    </div>
  );
}
