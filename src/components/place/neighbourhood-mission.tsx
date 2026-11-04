"use client";

import { useState } from "react";
import { placeHeading, type NameLike, type PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { missionMessages } from "@/lib/i18n/messages/stamps";
import { MissionBar, neighbourhoodName } from "@/components/explore/mission-bar";

export type MissionLike = {
  id: string;
  names: Readonly<Record<string, string>>;
  checked: number;
  left: number;
  nearby: readonly { slug: string; names: readonly NameLike[] }[];
};

/**
 * What this place's neighbourhood still needs. The number is the neighbourhood's, shared by everyone
 * who helps, and moves as soon as anyone checks a place (FR-015 rules out any count for a person).
 */
export function NeighbourhoodMission({
  locale,
  region,
  mission,
}: {
  locale: Locale;
  region: Pick<PublicRegionProps, "defaultLocale" | "nameFallback">;
  mission: MissionLike;
}) {
  const m = messagesFor(missionMessages, locale);
  // The number pops when it moves, which is the point, and not when the page first shows it.
  const [leftAtFirst] = useState(mission.left);
  const name = neighbourhoodName(mission.names, locale);
  const template = mission.left === 1 ? m.leftOne : m.left;
  const [before, after] = format(template, { name }).split("{n}");
  return (
    <section
      data-mission={mission.id}
      data-mission-left={mission.left}
      className="space-y-3 rounded-[10px] border border-line p-4"
    >
      <style>{`
        @keyframes mission-number {
          from { transform: scale(1.5); color: var(--color-beni); }
          to { transform: scale(1); }
        }
        @media (prefers-reduced-motion: no-preference) {
          [data-mission-moved] { display: inline-block; animation: mission-number 500ms ease-out; }
        }
      `}</style>
      <p role="status" aria-live="polite" className="text-[17px] font-bold">
        {mission.left === 0 ? (
          format(m.done, { name })
        ) : (
          <>
            {before}
            <span
              key={mission.left}
              data-mission-number=""
              data-mission-moved={mission.left === leftAtFirst ? undefined : ""}
            >
              {mission.left}
            </span>
            {after}
          </>
        )}
      </p>
      <MissionBar
        checked={mission.checked}
        left={mission.left}
        label={format(m.progressLabel, { name })}
        className="h-2"
      />
      {mission.nearby.length > 0 && (
        <div className="space-y-1">
          <p className="text-[15px] font-bold">{m.nearby}</p>
          <ul data-mission-nearby="" className="text-[15px]">
            {mission.nearby.map((place) => {
              const heading = placeHeading(place.names, locale, region).primary;
              return (
                <li key={place.slug}>
                  <a
                    lang={heading.lang}
                    className="inline-flex min-h-11 items-center text-ai underline [overflow-wrap:anywhere]"
                    href={localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}
                  >
                    {heading.text}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
