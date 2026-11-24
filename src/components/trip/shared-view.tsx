import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { labelForCategory } from "@/components/public/category";
import { placeHeading, type PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { tripSharedMessages } from "@/lib/i18n/messages/trip-shared";
import { directionsUrl, isAllowedMapsHost } from "@/lib/geo/maps-link";
import type { RegionConfig } from "@/lib/region/schema";
import { ruleTagLabel } from "@/lib/trip/vocabulary";

/** What `api.tripShare.read` returns for a live link. Nothing in it names a traveller. */
export type SharedTrip = NonNullable<FunctionReturnType<typeof api.tripShare.read>>;
type Day = SharedTrip["days"][number];
type Item = Day["items"][number];
type Stop = SharedTrip["stops"][number];
type Check = Extract<Item, { kind: "stop" }>["checks"][number];

export type SharedRegion = Pick<PublicRegionProps, "defaultLocale" | "nameFallback"> & {
  categories?: PublicRegionProps["categories"];
  roads?: Pick<NonNullable<RegionConfig["roads"]>, "points">;
  towns?: RegionConfig["towns"];
};

const cardClass = "rounded-[10px] border border-line bg-white p-4";

function words(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** A road point by the region file's own name, else its town's, else the id in plain words. */
export function pointName(region: SharedRegion, id: string, locale: Locale): string {
  const point = region.roads?.points.find((p) => p.id === id);
  const named = point?.names?.[locale];
  if (named) return named;
  const town = region.towns?.find((t) => t.onRoad === id || t.id === id);
  return town?.names[locale] ?? point?.names?.en ?? words(id);
}

/** A map link for a drive between two road points. Null when either point has no pin. */
export function driveMapsUrl(region: SharedRegion, from: string, to: string): string | null {
  const a = region.roads?.points.find((p) => p.id === from)?.pin;
  const b = region.roads?.points.find((p) => p.id === to)?.pin;
  if (!a || !b) return null;
  const url = directionsUrl(a, b);
  return isAllowedMapsHost(url) ? url : null;
}

function dayDate(date: string, locale: Locale): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    ...(locale === "en" ? { weekday: "short" as const } : {}),
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function CheckLine({
  check,
  stop,
  locale,
}: {
  check: Check;
  stop: Stop | undefined;
  locale: Locale;
}): React.JSX.Element {
  const m = messagesFor(tripSharedMessages, locale);
  const rule = ruleTagLabel(check.rule, locale);
  if (check.verdict === "not_known") {
    const reason =
      check.reason === "too_old"
        ? m.reasonTooOld
        : check.reason === "not_recorded_here"
          ? m.reasonNotRecorded
          : m.reasonNoRecord;
    return (
      <li>
        <span className="font-bold">{rule}</span>: {m.notChecked}{" "}
        <span className="text-muted-foreground">({reason})</span>
      </li>
    );
  }
  const fact = stop?.facts.find((f) => f.factId === check.restsOn.factId);
  const credit =
    fact?.basis === "member"
      ? format(m.metByMember, { name: fact.reporterName })
      : fact?.basis === "post"
        ? m.metByPost
        : m.metByOwner;
  return (
    <li>
      <span className="font-bold">{rule}</span>: {m.met}{" "}
      <span className="text-muted-foreground">({credit})</span>
    </li>
  );
}

function Quotes({ stop, locale }: { stop: Stop; locale: Locale }): React.JSX.Element | null {
  const m = messagesFor(tripSharedMessages, locale);
  const quotes = stop.quotes.slice(0, 2);
  if (quotes.length === 0) return null;
  return (
    <div className="space-y-2">
      {quotes.map((quote, i) => (
        <figure key={i} className="border-l-2 border-line pl-3">
          <blockquote lang={quote.lang} className="text-[15px] whitespace-pre-line">
            {quote.text}
          </blockquote>
          <figcaption className="text-[14px] text-muted-foreground">
            {quote.kind === "story" ? (
              format(m.quoteStory, { name: quote.authorName })
            ) : (
              <>
                {m.quotePost} ·{" "}
                <a
                  href={quote.source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline underline-offset-4"
                >
                  {m.quoteOriginal}
                </a>
              </>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function StopCard({
  item,
  stop,
  region,
  locale,
}: {
  item: Extract<Item, { kind: "stop" }>;
  stop: Stop | undefined;
  region: SharedRegion;
  locale: Locale;
}): React.JSX.Element | null {
  const m = messagesFor(tripSharedMessages, locale);
  const badges = messagesFor(badgeMessages, locale);
  // A place that is no longer public is simply not there.
  if ("placeId" in item && !stop) return null;
  const heading = stop ? placeHeading(stop.names, locale, region) : null;
  return (
    <li className={`${cardClass} space-y-3`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-[18px] font-bold">{item.at}</span>
        <span className="text-[14px] text-muted-foreground">
          {format(m.stopLength, { minutes: item.minutes })}
        </span>
      </div>
      <div>
        {stop && heading ? (
          <h3 className="font-sans text-[18px] font-bold break-words">
            <a
              href={localePath(locale, `/places/${encodeURIComponent(stop.slug)}`)}
              className="underline-offset-4 hover:underline"
              aria-label={`${heading.primary.text}. ${m.seePlace}`}
            >
              <span lang={heading.primary.lang}>{heading.primary.text}</span>
            </a>
            {heading.secondary && (
              <span lang={heading.secondary.lang} className="ml-2 text-[15px] font-normal">
                {heading.secondary.text}
              </span>
            )}
          </h3>
        ) : (
          <h3 className="font-sans text-[18px] font-bold break-words">
            {"pinLabel" in item ? item.pinLabel : ""}
          </h3>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
          {stop?.category && <span>{labelForCategory(region, stop.category, locale)}</span>}
          {stop && !stop.confirmed && (
            <span title={badges.unconfirmedHint} className="rounded-full bg-kamenozoki px-2 py-0.5">
              {m.unconfirmed}
            </span>
          )}
          {!stop && <span>{m.pinTag}</span>}
        </p>
      </div>
      {item.turnLabel && (
        <p className="font-bold text-ai">{format(m.turn, { label: item.turnLabel })}</p>
      )}
      {item.checks.length > 0 && (
        <div className="space-y-1 text-[15px]">
          <h4 className="font-bold">{m.checksTitle}</h4>
          <ul className="space-y-1">
            {item.checks.map((check) => (
              <CheckLine key={check.rule} check={check} stop={stop} locale={locale} />
            ))}
          </ul>
        </div>
      )}
      {stop && <Quotes stop={stop} locale={locale} />}
    </li>
  );
}

function restLabel(why: "stretch" | "after_lunch" | "need" | "meal", locale: Locale): string {
  const m = messagesFor(tripSharedMessages, locale);
  return {
    stretch: m.restStretch,
    after_lunch: m.restAfterLunch,
    need: m.restNeed,
    meal: m.restMeal,
  }[why];
}

/**
 * The plan as the party reads it from a private link: days, drives, stops, rests and meals, with
 * the organiser's own labels on turns. No account, no age, no like and no purpose is in the data.
 */
export function SharedView({
  locale,
  trip,
  region,
}: {
  locale: Locale;
  trip: SharedTrip;
  region: SharedRegion;
}): React.JSX.Element {
  const m = messagesFor(tripSharedMessages, locale);
  const stops = new Map<string, Stop>(trip.stops.map((s) => [s.placeId, s]));
  const days = [...trip.days].sort((a, b) => a.index - b.index);
  return (
    <div className="w-full max-w-2xl space-y-6" lang={locale}>
      <section className="space-y-2 rounded-[10px] bg-kamenozoki p-4 text-[15px]">
        <p>{m.sharedNote}</p>
        <p>{m.whoseNote}</p>
        <p className="font-bold">{m.estimateNote}</p>
      </section>
      {days.length === 0 && <p>{m.noDays}</p>}
      {days.map((day) => (
        <section key={day.index} aria-labelledby={`day-${day.index}`} className="space-y-3">
          <h2 id={`day-${day.index}`} className="font-sans text-[22px] font-bold">
            {day.date
              ? format(m.dayDate, { n: day.index, date: dayDate(day.date, locale) })
              : format(m.day, { n: day.index })}
          </h2>
          <ol className="space-y-3">
            {day.items.map((item, i) => {
              if (item.kind === "stop") {
                return (
                  <StopCard
                    key={i}
                    item={item}
                    stop={"placeId" in item ? stops.get(item.placeId) : undefined}
                    region={region}
                    locale={locale}
                  />
                );
              }
              if (item.kind === "rest") {
                return (
                  <li key={i} className={`${cardClass} text-[15px]`}>
                    <span className="font-bold">{item.at}</span> {restLabel(item.why, locale)}{" "}
                    <span className="text-muted-foreground">
                      ({format(m.restLength, { minutes: item.minutes })})
                    </span>
                  </li>
                );
              }
              const url = driveMapsUrl(region, item.from, item.to);
              return (
                <li key={i} className="space-y-1 border-l-4 border-line pl-4 text-[15px]">
                  <p className="font-bold">
                    {format(m.drive, {
                      from: pointName(region, item.from, locale),
                      to: pointName(region, item.to, locale),
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {format(m.driveDetail, {
                      minutes: Math.round(item.minutes),
                      km: Math.round(item.kilometres),
                    })}
                  </p>
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center text-ai underline underline-offset-4"
                    >
                      {m.openInMaps}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
          {day.night && (
            <p className="text-[15px] text-muted-foreground">
              {format(m.night, { town: pointName(region, day.night, locale) })}
            </p>
          )}
        </section>
      ))}
      <p className="text-[14px] text-muted-foreground">{m.footer}</p>
    </div>
  );
}
