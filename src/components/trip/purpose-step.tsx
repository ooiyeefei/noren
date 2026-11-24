"use client";

import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import { fieldClass, helpClass } from "./route-step";

const MAX = 280;

/** What the trip is for, what would make it good and what would spoil it, in the organiser's words. */
export function PurposeStep({
  locale,
  purpose,
  onChange,
}: {
  locale: Locale;
  purpose: string;
  onChange(purpose: string): void;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  return (
    <div className="space-y-4">
      <h2 className="font-sans text-[22px] font-bold">{m.purposeIntro}</h2>
      <label htmlFor="trip-purpose" className="block font-bold">
        {m.purposeLabel}
      </label>
      <p id="trip-purpose-help" className={helpClass}>
        {m.purposeHelp}
      </p>
      <textarea
        id="trip-purpose"
        value={purpose}
        maxLength={MAX}
        rows={5}
        aria-describedby="trip-purpose-help trip-purpose-left"
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} py-2`}
      />
      <p id="trip-purpose-left" className={helpClass}>
        {format(m.purposeLeft, { n: MAX - purpose.length })}
      </p>
    </div>
  );
}
