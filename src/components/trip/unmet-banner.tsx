import Link from "next/link";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { Plan } from "@/lib/trip/types";
import { buttonClass, quietButtonClass } from "./route-step";

const words = (locale: Locale): Record<string, string> => messagesFor(tripMessages, locale);

/**
 * The plain sentence for an engine reason code. A code with no wording of its own falls back to
 * the sentence for its family (`change_*`), then to a general line; the raw code is never shown.
 */
export function reasonText(locale: Locale, code: string): string {
  const m = words(locale);
  return m[`reason_${code}`] ?? (code.startsWith("change_") ? m.reason_change : undefined) ?? m.reasonUnknown!;
}

export function choiceText(locale: Locale, choice: string): string {
  const m = words(locale);
  return m[`choice_${choice}`] ?? m.choiceUnknown!;
}

/**
 * What Noren could not meet, at the top of the plan, with the choices it left. Three choices can be
 * acted on from here (a day more, the route, the limit); the rest are said in words. Nothing on
 * this banner is a count or a ranking.
 */
export function UnmetBanner({
  locale,
  tripId,
  unmet,
  onAddDay,
  busy = false,
}: {
  locale: Locale;
  tripId: string;
  unmet: Plan["unmet"];
  onAddDay?: () => void;
  busy?: boolean;
}): React.JSX.Element | null {
  const m = messagesFor(tripMessages, locale);
  if (unmet.length === 0) return null;
  const editHref = localePath(locale, `/trip/${encodeURIComponent(tripId)}/party`);
  return (
    <section
      aria-labelledby="plan-unmet"
      className="max-w-3xl space-y-4 rounded-[10px] border border-kasutera bg-white p-4"
    >
      <h2 id="plan-unmet" className="font-sans text-[20px] font-bold">
        {m.unmetHeading}
      </h2>
      <ul className="space-y-4">
        {unmet.map((entry, index) => (
          <li key={`${entry.what}-${entry.detail}-${entry.day ?? 0}-${entry.slot ?? ""}-${index}`} className="space-y-2">
            <p>
              {entry.day !== undefined && (
                <span className="font-bold">{format(m.unmetDay, { n: entry.day })}. </span>
              )}
              {reasonText(locale, entry.detail)}
            </p>
            {entry.choices.length > 0 && (
              <div className="space-y-1">
                <p className="text-[14px] font-bold text-muted-foreground">{m.unmetChoices}</p>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {entry.choices.map((choice) => (
                    <li key={choice}>
                      {choice === "add_day" && onAddDay ? (
                        <button type="button" disabled={busy} className={buttonClass} onClick={onAddDay}>
                          {m.choiceAddDayGo}
                        </button>
                      ) : choice === "drop_town" ? (
                        <Link className={`${quietButtonClass} inline-flex items-center`} href={editHref}>
                          {m.choiceChangeRoute}
                        </Link>
                      ) : choice === "raise_limit" ? (
                        <Link className={`${quietButtonClass} inline-flex items-center`} href={editHref}>
                          {m.choiceChangeLimit}
                        </Link>
                      ) : (
                        <span>{choiceText(locale, choice)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
