import { checkDate } from "@/components/place/check-state";
import { neighbourhoodName } from "@/components/explore/mission-bar";
import { dayToTime } from "@/lib/collection/reach";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { BadgeCloth } from "./noren";

export type BadgeLike = {
  setId: string;
  names: Readonly<Record<string, string>>;
  wholeArtUrl: string | null;
  finishedOn: string;
};

/** A person's finished neighbourhoods, each with its date. Badges buy nothing (FR-111). */
export function BadgeShelf({
  locale,
  badges,
  panelCount,
}: {
  locale: Locale;
  badges: readonly BadgeLike[];
  panelCount: number;
}) {
  const m = messagesFor(collectionMessages, locale);
  return (
    <section className="space-y-3">
      <h2 className="text-[22px] font-bold">{m.badges}</h2>
      {badges.length === 0 && <p className="text-[15px] text-muted-foreground">{m.noBadges}</p>}
      <ul className="space-y-4">
        {badges.map((badge) => {
          const name = neighbourhoodName(badge.names, locale);
          return (
            <li
              key={badge.setId}
              data-badge-set={badge.setId}
              className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4"
            >
              <BadgeCloth
                locale={locale}
                name={name}
                artUrl={badge.wholeArtUrl}
                panelCount={panelCount}
              />
              <div>
                <p className="font-bold">{name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {format(m.finishedOn, { date: checkDate(dayToTime(badge.finishedOn), locale) })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
