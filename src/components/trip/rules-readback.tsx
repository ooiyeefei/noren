"use client";

import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { StoredParty } from "@/lib/trip/storage";
import { needLabel, ruleTagLabel } from "@/lib/trip/vocabulary";
import { PlanConsentButton } from "./plan-consent";
import { quietButtonClass } from "./route-step";

/**
 * The party's must-haves, grouped by the rule and not by the person, for the organiser to confirm
 * or correct before the first plan (FR-310). Plain sentences, no count or ranking of anyone.
 */
export function rulesByTag(party: StoredParty): { tag: string; who: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const traveller of party.travellers) {
    for (const tag of traveller.rules) {
      groups.set(tag, [...(groups.get(tag) ?? []), traveller.label.trim()]);
    }
  }
  return [...groups].map(([tag, who]) => ({ tag, who }));
}

export function RulesReadback({
  locale,
  party,
  onConfirm,
  onChange,
}: {
  locale: Locale;
  party: StoredParty;
  onConfirm(): void;
  onChange(): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const rules = rulesByTag(party);
  return (
    <div className="space-y-5">
      <h2 className="font-sans text-[22px] font-bold">{m.readbackTitle}</h2>
      <p className="max-w-prose">{m.readbackLead}</p>
      {rules.length === 0 ? (
        <p>{m.readbackNone}</p>
      ) : (
        <ul className="space-y-2" aria-label={m.rulesLegend}>
          {rules.map(({ tag, who }) => (
            <li key={tag} className="rounded-[10px] border border-line bg-white p-3">
              {format(m.readbackRule, {
                rule: ruleTagLabel(tag, locale),
                who:
                  who.length === party.travellers.length && who.length > 1
                    ? m.readbackEveryone
                    : who.map((name) => name || m.someone).join(locale === "ja" ? "、" : ", "),
              })}
            </li>
          ))}
        </ul>
      )}
      {party.needs.length > 0 && (
        <section aria-labelledby="readback-times" className="space-y-2">
          <h3 id="readback-times" className="font-bold">
            {m.readbackTimes}
          </h3>
          <ul className="space-y-2">
            {party.needs.map((need, i) => (
              <li
                key={`${need.kind}-${need.at}-${i}`}
                className="rounded-[10px] border border-line bg-white p-3"
              >
                {format(m.readbackTime, {
                  kind: needLabel(need.kind, locale),
                  minutes: need.minutes,
                  time: need.at,
                })}
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="space-y-3">
        <PlanConsentButton locale={locale} label={m.readbackConfirm} onClick={onConfirm} />
        <button type="button" className={quietButtonClass} onClick={onChange}>
          {m.readbackChange}
        </button>
      </div>
    </div>
  );
}
