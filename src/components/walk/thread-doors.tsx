"use client";

import { useId } from "react";
import { placeHeading, type PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, type Locale } from "@/lib/i18n";
import type { WalkMessageTable } from "@/lib/i18n/messages/walk";
import { SLIP_HERE_METRES } from "@/lib/walk/constants";
import { legFrom } from "@/lib/walk/omikuji";
import type { Pin, ThreadStop } from "@/lib/walk/types";
import { COMPASS_WORD } from "./compass-word";
import { SealedQuestion, questionText, type DoorProps } from "./slip-seal";

const NEW_TAB = { target: "_blank", rel: "noopener" } as const;

/**
 * "Three doors": the two further doors of a slip. Door two shows once the slip's own seal is open,
 * and door three once door two is. Each opens with the same three ways as the first seal, all on
 * the phone: nothing is requested from Noren when one opens, and nothing counts the doors. A door
 * is never ranked: how it was chosen is said in one plain line.
 */
export function ThreadDoors({
  locale,
  region,
  m,
  first,
  stops,
  doors,
  onOpenDoor,
  from,
  tiedOn,
  door,
}: {
  locale: Locale;
  region: PublicRegionProps;
  m: WalkMessageTable;
  /** The slip's own place: where door two is measured from when the phone has no reading. */
  first: { pin: Pin; name: string };
  /** The slip's two further doors, in order. */
  stops: readonly ThreadStop[];
  /** How many of them are open (0, 1 or 2). */
  doors: number;
  onOpenDoor(door: 1 | 2): void;
  /** Where the phone is, when a reading exists; it stays on the phone. */
  from: Pin | null;
  /** The date the thread is tied on, already written out for the page's language. */
  tiedOn: string;
  /** The reading, allowance and locate the first seal uses. */
  door: Pick<DoorProps, "position" | "accuracyAllowanceMetres" | "locate">;
}) {
  const titleId = useId();
  const name = (names: Parameters<typeof placeHeading>[0]) =>
    placeHeading(names, locale, region).primary;
  // A stop whose question this version cannot show has nothing to open, so it does not hold the next back.
  const passed = (index: number) =>
    doors > index || questionText(stops[index]!.question, locale) === undefined;

  const stop = (index: 0 | 1) => {
    const entry = stops[index]!;
    const heading = name(entry.place.names);
    const path = localePath(locale, `/places/${encodeURIComponent(entry.place.slug)}`);
    // With a reading, from where the phone is; without one, from the door before (public pins only).
    const before =
      index === 0 ? first : { pin: stops[0]!.place.pin, name: name(stops[0]!.place.names).text };
    const leg = legFrom(from ?? before.pin, entry.place.pin);
    const via =
      entry.via === "draw"
        ? m.viaDraw
        : entry.carried.askedBy
          ? format(m.viaCarried, {
              name: entry.carried.askedBy,
              place: name(entry.carried.from.names).text,
            })
          : format(m.viaCarriedAnon, { place: name(entry.carried.from.names).text });
    return (
      <div
        key={index}
        data-thread-door={index + 2}
        className="space-y-3 rounded-[10px] border border-line p-4"
      >
        <p className="text-[15px] font-bold text-muted-foreground">
          {index === 0 ? m.threadSecond : m.threadThird}
        </p>
        <h5
          className="text-[22px] leading-snug font-bold [overflow-wrap:anywhere]"
          lang={heading.lang}
        >
          <a className="underline" href={path} {...NEW_TAB}>
            {heading.text}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
        </h5>
        <p data-thread-via={entry.via} className="text-[15px]">
          {via}
        </p>
        <p data-thread-leg="" className="font-bold">
          {from && leg.straightMetres <= SLIP_HERE_METRES
            ? m.slipHere
            : format(from ? m.slipLeg : m.threadLegFrom, {
                metres: leg.metres.toLocaleString(locale),
                minutes: leg.minutes,
                direction: m[COMPASS_WORD[leg.compass]],
                name: before.name,
              })}
        </p>
        <SealedQuestion
          locale={locale}
          m={m}
          question={entry.question}
          placePath={path}
          pin={entry.place.pin}
          {...(entry.question.kind === "story" && entry.question.carriedFrom
            ? { carriedFromName: name(entry.question.carriedFrom.names).text }
            : {})}
          door={{
            opened: doors > index,
            onOpen: () => onOpenDoor((index + 1) as 1 | 2),
            position: door.position,
            accuracyAllowanceMetres: door.accuracyAllowanceMetres,
            locate: door.locate,
          }}
        />
      </div>
    );
  };

  return (
    <section
      data-slip-thread=""
      aria-labelledby={titleId}
      className="space-y-3 border-t border-line pt-4"
    >
      <h4 id={titleId} className="font-sans text-[20px] font-bold">
        {m.threadTitle}
      </h4>
      <p>{m.threadIntro}</p>
      {stop(0)}
      {passed(0) ? (
        stop(1)
      ) : (
        <p data-thread-waiting="" className="font-bold">
          {m.threadWaiting}
        </p>
      )}
      {doors >= 2 && (
        <p data-thread-tied="" className="font-bold">
          {format(m.threadTied, { date: tiedOn })}
        </p>
      )}
    </section>
  );
}
