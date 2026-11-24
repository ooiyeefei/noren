"use client";

import Link from "next/link";
import { UnconfirmedBadge } from "@/components/badges";
import { factDate } from "@/components/facts/fact-list";
import { QuoteView } from "@/components/planner/quote-view";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { factMessages } from "@/lib/i18n/messages/facts";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { PlannerQuote } from "@/lib/planner/reply";
import type { Stop } from "@/lib/trip/types";
import { ruleTagLabel, TRIP_TASTES } from "@/lib/trip/vocabulary";
import { pinHref } from "./drive-row";
import { buttonClass, quietButtonClass } from "./route-step";

/** What a met check rests on, as `trips.stops` reads it afresh: a member's report, or a visitor's post. */
export type RestsOnDetail =
  | { kind: "member"; name: string; day: string }
  | { kind: "post"; quote: string; platform: string; link?: string; day?: string };

/** The present public details of one place. Never stored on the device. */
export type StopInfo = {
  name: string;
  /** The category in the reader's language. */
  category?: string;
  slug: string;
  pin: { lat: number; lng: number } | null;
  confirmed: boolean;
  /** Up to two are shown. Each is somebody's words with its source; the page writes none of its own. */
  quotes: readonly PlannerQuote[];
  /** Only when Noren holds opening hours with a source. */
  hours?: { text: string; source: string };
  /** By fact id. */
  rests: Readonly<Record<string, RestsOnDetail>>;
};

/** What the page can say about a stop's place right now. */
export type StopLookup =
  | { state: "ready"; info: StopInfo }
  | { state: "gone" }
  | { state: "loading" }
  | { state: "offline" }
  /** A spot the organiser pinned that is not a place on Noren: no quotes, nothing to check. */
  | { state: "spot" };

export type StopCardProps = {
  locale: Locale;
  stop: Stop;
  /** The organiser's labels by traveller key. They come from the device, never from the server. */
  labels: Readonly<Record<string, string>>;
  /** The organiser's own name for a pinned spot. */
  pinLabel?: string;
  lookup: StopLookup;
  /** What to call the place until its name has been read (its address, in words). */
  fallbackName: string;
  done: boolean;
  busy: boolean;
  /** False with no connection: the buttons wait. */
  canChange: boolean;
  onRedraw(): void;
  onSkip(): void;
  onDone(): void;
  /** "Still here" and "Tell us what you found", wired to the place by the container. */
  tools?: React.ReactNode;
};

function joinList(locale: Locale, items: string[]): string {
  return items.join(locale === "ja" ? "、" : ", ");
}

/** Why this stop is here, in the organiser's own label (FR-319, FR-320). Never a count or a score. */
export function whyLine(
  locale: Locale,
  because: Stop["because"],
  labels: Readonly<Record<string, string>>,
): string {
  const m = messagesFor(tripMessages, locale);
  switch (because.kind) {
    case "need":
      return {
        meal: m.whyMeal,
        prayer: m.whyPrayer,
        work: m.whyWork,
        rest: m.whyRest,
      }[because.need];
    case "pin":
      return m.whyPin;
    case "wild":
      return m.whyWild;
    case "turn":
    case "paired": {
      const label = labels[because.for]?.trim();
      if (!label) return m.whyForUnknown;
      if (because.kind === "paired") {
        const other = labels[because.with]?.trim();
        return other ? format(m.whyPaired, { label, other }) : format(m.whyFor, { label });
      }
      const likes = because.likes
        .map((tag) => TRIP_TASTES.find((taste) => taste.tag === tag)?.label[locale])
        .filter((text): text is string => text !== undefined);
      return likes.length > 0
        ? format(m.whyForLikes, { label, likes: joinList(locale, likes) })
        : format(m.whyFor, { label });
    }
  }
}

function slugWords(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
export { slugWords };

function Checks({
  locale,
  stop,
  info,
}: {
  locale: Locale;
  stop: Stop;
  info: StopInfo | undefined;
}) {
  const m = messagesFor(tripMessages, locale);
  const facts = messagesFor(factMessages, locale);
  const reasons = {
    no_record: m.reasonNoRecord,
    too_old: m.reasonTooOld,
    not_recorded_here: m.reasonNotRecorded,
  };
  // Once the place has been read afresh, a check whose record has left is not a check any more.
  const withdrawn = (c: Stop["checks"][number]) =>
    c.verdict === "met" &&
    c.restsOn.kind !== "owner" &&
    info !== undefined &&
    (c.restsOn.factId === undefined || info.rests[c.restsOn.factId] === undefined);
  const met = stop.checks.flatMap((c) => (c.verdict === "met" && !withdrawn(c) ? [c] : []));
  const unknown = stop.checks.flatMap((c) =>
    c.verdict === "not_known"
      ? [{ rule: c.rule, reason: reasons[c.reason] }]
      : withdrawn(c)
        ? [{ rule: c.rule, reason: m.reasonWithdrawn }]
        : [],
  );
  return (
    <>
      {met.length > 0 && (
        <div className="space-y-1">
          <h4 className="font-bold">{m.checkedHeading}</h4>
          <ul className="space-y-2 text-[15px]">
            {met.map((check) => {
              const rule = ruleTagLabel(check.rule, locale);
              const rests = check.restsOn.factId ? info?.rests[check.restsOn.factId] : undefined;
              if (check.restsOn.kind === "owner") {
                return <li key={check.rule}>{format(m.checkedOwner, { rule })}</li>;
              }
              if (check.restsOn.kind === "member") {
                return (
                  <li key={check.rule}>
                    {rests?.kind === "member"
                      ? format(m.checkedMember, {
                          rule,
                          name: rests.name,
                          date: factDate(rests.day, locale),
                        })
                      : format(m.checkedMemberUnread, { rule })}
                  </li>
                );
              }
              return (
                <li key={check.rule} className="space-y-1">
                  <p>
                    {rests?.kind === "post"
                      ? format(m.checkedPost, { rule })
                      : format(m.checkedPostUnread, { rule })}
                  </p>
                  {rests?.kind === "post" && (
                    <blockquote className="border-l-2 border-line pl-3 break-words">
                      {rests.quote}
                      {/* Credited as the place page credits it: a visitor's own words, with their post. */}
                      <span className="block text-[14px] text-muted-foreground">
                        {rests.day
                          ? format(facts.visitorWords, { date: factDate(rests.day, locale) })
                          : null}
                        {rests.link && (
                          <>
                            {rests.day ? " · " : ""}
                            <a
                              href={rests.link}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-ai underline"
                            >
                              {facts.viewPost}
                            </a>
                          </>
                        )}
                      </span>
                    </blockquote>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {unknown.length > 0 && (
        <div className="space-y-1">
          <h4 className="font-bold">{m.notCheckedHeading}</h4>
          <ul className="space-y-1 text-[15px]">
            {unknown.map((check) => (
              <li key={check.rule}>
                {format(m.notCheckedLine, {
                  rule: ruleTagLabel(check.rule, locale),
                  reason: check.reason,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * One stop. It writes no description of the place: what it shows is the place's name and category
 * from Noren's records, up to two quotes with who wrote them, and what Noren could and could not
 * check, with what each check rests on. A plain component that takes everything as props.
 */
export function StopCard(props: StopCardProps): React.JSX.Element {
  const { locale, stop, lookup } = props;
  const m = messagesFor(tripMessages, locale);
  const info = lookup.state === "ready" ? lookup.info : undefined;
  const isPin = "pinId" in stop.place;
  const isSpot = lookup.state === "spot";
  const gone = lookup.state === "gone";
  const name = isSpot
    ? props.pinLabel?.trim() || m.pinnedSpot
    : (info?.name ?? (isPin ? props.pinLabel?.trim() : undefined) ?? props.fallbackName);
  const slug = isSpot ? undefined : "slug" in stop.place ? stop.place.slug : info?.slug;
  const mapsHref = info?.pin ? pinHref(info.pin) : undefined;
  const canRedraw = !isPin && !props.done;
  const canSkip = !isPin && !props.done;
  const quotes = info?.quotes.slice(0, 2) ?? [];
  return (
    <li
      className="space-y-3 rounded-[10px] border border-line bg-white p-4"
      data-slot={stop.slot}
      data-done={props.done || undefined}
    >
      <p className="text-[15px] text-muted-foreground">
        {format(m.stopLine, { at: stop.at, minutes: stop.minutes })}
      </p>
      {stop.legBefore && (
        <p className="text-[14px] text-muted-foreground">
          {format(stop.legBefore.how === "walk" ? m.legWalk : m.legDrive, {
            minutes: Math.round(stop.legBefore.minutes),
          })}
        </p>
      )}
      <div className="space-y-1">
        <h3 className="font-sans text-[20px] font-bold break-words">
          {slug && !gone ? (
            <Link className="text-ai underline" href={localePath(locale, `/places/${encodeURIComponent(slug)}`)}>
              {name}
            </Link>
          ) : (
            name
          )}
        </h3>
        {(info?.category || (info && !info.confirmed)) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
            {info?.category && <span>{info.category}</span>}
            {info && !info.confirmed && <UnconfirmedBadge locale={locale} />}
          </p>
        )}
        {!isSpot && !info && !gone && (
          <p className="text-[14px] text-muted-foreground">{m.stopNameOffline}</p>
        )}
      </div>
      <p className="font-bold">{whyLine(locale, stop.because, props.labels)}</p>

      {gone && (
        <p role="note" className="rounded-[10px] border border-beni p-3 font-bold text-beni">
          {m.stopGone}
        </p>
      )}

      {!isSpot && !gone && (
        <div className="space-y-2">
          {lookup.state === "offline" && <p className="text-[15px]">{m.quotesNeedConnection}</p>}
          {lookup.state === "loading" && (
            <p role="status" className="text-[15px] text-muted-foreground">
              {m.quotesLoading}
            </p>
          )}
          {lookup.state === "ready" && quotes.length > 0 && (
            <>
              <h4 className="font-bold">{m.quotesHeading}</h4>
              <ul className="space-y-3">
                {quotes.map((quote) => (
                  <li key={quote.id}>
                    <QuoteView locale={locale} quote={quote} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {lookup.state === "ready" && quotes.length === 0 && (
            <p className="flex flex-wrap items-center gap-x-4 text-[15px]">
              <span className="text-muted-foreground">{m.quotesNobody}</span>
              {slug && (
                <Link
                  className="inline-flex min-h-11 items-center text-ai underline"
                  href={`${localePath(locale, `/places/${encodeURIComponent(slug)}`)}?tab=stories&write=1`}
                >
                  {m.quotesFirst}
                </Link>
              )}
            </p>
          )}
        </div>
      )}

      {!gone && <Checks locale={locale} stop={stop} info={info} />}

      {!isSpot && !gone && (
        <p className="text-[15px] text-muted-foreground">
          {info?.hours
            ? format(m.hoursKnown, { text: info.hours.text, source: info.hours.source })
            : m.hoursUnknown}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-ai underline"
          >
            {m.openInMaps}
          </a>
        )}
        {slug && !gone && (
          <Link
            className="inline-flex min-h-11 items-center text-ai underline"
            href={localePath(locale, `/places/${encodeURIComponent(slug)}`)}
          >
            {m.openPlacePage}
          </Link>
        )}
      </div>

      {props.tools}

      {props.done ? (
        <p role="status" className="font-bold">
          {m.isDone}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {canRedraw && (
            <button
              type="button"
              className={quietButtonClass}
              disabled={props.busy || !props.canChange}
              onClick={props.onRedraw}
            >
              {m.drawAnother}
            </button>
          )}
          {canSkip && (
            <button
              type="button"
              className={quietButtonClass}
              disabled={props.busy || !props.canChange}
              onClick={props.onSkip}
            >
              {m.skipStop}
            </button>
          )}
          {!gone && (
            <button type="button" className={buttonClass} disabled={props.busy} onClick={props.onDone}>
              {m.doneStop}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
