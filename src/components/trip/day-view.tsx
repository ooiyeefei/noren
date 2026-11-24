import { Coffee } from "lucide-react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { Plan, Rest, Stop } from "@/lib/trip/types";
import { DriveRow, type PointInfo } from "./drive-row";
import { quietButtonClass } from "./route-step";
import { StopCard, slugWords, type StopLookup } from "./stop-card";

export type PlanDay = Plan["days"][number];

/** What the day needs to know of a traveller: the key, the organiser's label, likes and days. */
export type DayTraveller = { key: string; label: string; hasLikes: boolean; days?: number[] };

export type DayViewProps = {
  locale: Locale;
  day: PlanDay;
  point(id: string): PointInfo;
  labels: Readonly<Record<string, string>>;
  travellers: readonly DayTraveller[];
  pinLabels: Readonly<Record<string, string>>;
  lookupFor(stop: Stop): StopLookup;
  toolsFor?(stop: Stop): React.ReactNode;
  done: ReadonlySet<string>;
  busy: boolean;
  canChange: boolean;
  onRedraw(slot: string): void;
  onSkip(slot: string): void;
  onDone(slot: string): void;
  onTurn(who: string, day: number): void;
};

export function minutesText(locale: Locale, total: number): string {
  const m = messagesFor(tripMessages, locale);
  const minutes = Math.round(total);
  const h = Math.floor(minutes / 60);
  return h > 0
    ? format(m.planDuration, { h, m: minutes % 60 })
    : format(m.planDurationMinutes, { m: minutes });
}

function dateText(locale: Locale, date: string): string | undefined {
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(time)
    ? undefined
    : new Intl.DateTimeFormat(locale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      }).format(time);
}

/**
 * Travellers with likes who are on this day and have no turn on it, when the day had room for
 * everyone to have one. Said in words and never counted (FR-321).
 */
export function travellersWithoutTurn(day: PlanDay, travellers: readonly DayTraveller[]) {
  const present = travellers.filter(
    (t) => t.hasLikes && (t.days === undefined || t.days.includes(day.index)),
  );
  const open = day.items.filter(
    (item): item is Stop => item.kind === "stop" && /\.open\d+$/.test(item.slot),
  );
  if (present.length === 0 || open.length < present.length) return [];
  const had = new Set(
    open.flatMap(({ because }) =>
      because.kind === "turn"
        ? [because.for]
        : because.kind === "paired"
          ? [because.for, because.with]
          : [],
    ),
  );
  return present.filter((t) => !had.has(t.key));
}

function RestRow({ locale, rest }: { locale: Locale; rest: Rest }) {
  const m = messagesFor(tripMessages, locale);
  const why = {
    stretch: m.restWhyStretch,
    after_lunch: m.restWhyAfterLunch,
    need: m.restWhyNeed,
    meal: m.restWhyMeal,
  }[rest.why];
  return (
    <li className="flex items-start gap-3 rounded-[10px] border border-dashed border-line p-3">
      <Coffee aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <p className="min-w-0 break-words">
        {format(m.restLine, { at: rest.at, why, minutes: Math.round(rest.minutes) })}
      </p>
    </li>
  );
}

/** One day: weekday and date, the calendar, drives, stops in order, rests and the day's driving. */
export function DayView(props: DayViewProps): React.JSX.Element {
  const { locale, day } = props;
  const m = messagesFor(tripMessages, locale);
  const date = day.date ? dateText(locale, day.date) : undefined;
  const heading = date
    ? format(m.planDayDate, { n: day.index, date })
    : day.weekday
      ? format(m.planDayDate, { n: day.index, date: day.weekday })
      : format(m.planDay, { n: day.index });
  const id = `plan-day-${day.index}`;
  const missed = travellersWithoutTurn(day, props.travellers);
  return (
    <section aria-labelledby={id} className="max-w-3xl space-y-4">
      <div className="space-y-1">
        <h2 id={id} className="font-sans text-[22px] font-bold">
          {heading}
        </h2>
        {day.calendar.length > 0 && (
          <ul className="space-y-0.5 text-[15px]">
            {day.calendar.map((entry) => (
              <li key={entry.text}>
                {entry.text}
                {!entry.verified && (
                  <span className="ml-2 text-muted-foreground">({m.calendarNotConfirmed})</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {day.notes.includes("busy_travel_day") && (
          <p role="note" className="font-bold">
            {m.planBusyDay}
          </p>
        )}
        {day.notes.includes("mostly_driving") && <p className="text-[15px]">{m.planMostlyDriving}</p>}
      </div>
      {missed.map((t) => (
        <div
          key={t.key}
          role="note"
          className="flex flex-wrap items-center gap-3 rounded-[10px] bg-kamenozoki p-3"
        >
          <p className="min-w-0 flex-1">
            {format(m.turnMissed, { label: t.label.trim() || m.turnSomeone })}
          </p>
          <button
            type="button"
            className={quietButtonClass}
            disabled={props.busy || !props.canChange}
            onClick={() => props.onTurn(t.key, day.index)}
          >
            {format(m.turnGive, { label: t.label.trim() || m.turnSomeone })}
          </button>
        </div>
      ))}
      <ol className="space-y-3">
        {day.items.map((item, index) => {
          if (item.kind === "drive") {
            return (
              <DriveRow
                key={`drive-${index}`}
                locale={locale}
                drive={item}
                from={props.point(item.from)}
                to={props.point(item.to)}
              />
            );
          }
          if (item.kind === "rest") {
            return <RestRow key={`rest-${index}`} locale={locale} rest={item} />;
          }
          const placeSlug = "slug" in item.place ? item.place.slug : "";
          return (
            <StopCard
              key={item.slot}
              locale={locale}
              stop={item}
              labels={props.labels}
              pinLabel={"pinId" in item.place ? props.pinLabels[item.place.pinId] : undefined}
              lookup={props.lookupFor(item)}
              fallbackName={slugWords(placeSlug)}
              done={props.done.has(item.slot)}
              busy={props.busy}
              canChange={props.canChange}
              onRedraw={() => props.onRedraw(item.slot)}
              onSkip={() => props.onSkip(item.slot)}
              onDone={() => props.onDone(item.slot)}
              tools={props.toolsFor?.(item)}
            />
          );
        })}
      </ol>
      <p className="text-[15px] text-muted-foreground">
        {format(m.planDriveTotal, { time: minutesText(locale, day.driveMinutes) })}
        {day.night && <> · {format(m.planSleep, { town: props.point(day.night).name })}</>}
      </p>
    </section>
  );
}
