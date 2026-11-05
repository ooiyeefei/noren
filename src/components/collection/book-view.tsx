import { neighbourhoodName } from "@/components/explore/mission-bar";
import type { PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { BadgeShelf, type BadgeLike } from "./badge-shelf";
import { NextPanelCard, type SetLike } from "./next-panel-card";
import { Noren, type NorenPanel } from "./noren";

export type BookSetLike = {
  id: string;
  neighbourhoodId: string;
  names: Readonly<Record<string, string>>;
  panelCount: number;
  dyedCount: number;
  panels: readonly NorenPanel[];
};

/** The live sets with this person's own progress, and their badges. Signed out, nothing is dyed. */
export function BookView({
  locale,
  region,
  sets,
  next,
  badges,
  panelsPerSet,
  signedIn,
}: {
  locale: Locale;
  region: Pick<PublicRegionProps, "defaultLocale" | "nameFallback">;
  sets: readonly BookSetLike[];
  /** The set to walk next, once it has loaded. */
  next?: SetLike | null;
  badges: readonly BadgeLike[];
  panelsPerSet: number;
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
}) {
  const m = messagesFor(collectionMessages, locale);
  return (
    <div lang={locale} className="max-w-[720px] space-y-8 text-kon" data-collection="">
      <div className="space-y-2">
        <p className="max-w-prose text-[17px]">{m.intro}</p>
        {signedIn && <p className="text-[13px] text-muted-foreground">{m.onlyYou}</p>}
        {signedIn === false && (
          <p className="text-[15px]">
            {m.signInToKeep}{" "}
            <a
              className="inline-flex min-h-11 items-center text-ai underline"
              href={localePath(locale, "/sign-in")}
            >
              {m.signIn}
            </a>
          </p>
        )}
      </div>
      {sets.length === 0 && <p>{m.empty}</p>}
      {next && <NextPanelCard locale={locale} region={region} set={next} />}
      <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
        {sets.map((set) => {
          const name = neighbourhoodName(set.names, locale);
          return (
            <li key={set.id}>
              <a
                data-book-set={set.neighbourhoodId}
                href={localePath(locale, `/collection/${set.neighbourhoodId}`)}
                className="group block space-y-2 rounded-[10px] p-2 hover:bg-kamenozoki/50"
              >
                <Noren
                  locale={locale}
                  name={name}
                  panels={set.panels}
                  panelCount={set.panelCount}
                  size="mini"
                />
                <span className="block font-bold group-hover:underline">{name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {signedIn
                    ? format(m.progress, {
                        dyed: String(set.dyedCount),
                        total: String(set.panelCount),
                      })
                    : format(m.panelCount, { total: String(set.panelCount) })}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {signedIn && <BadgeShelf locale={locale} badges={badges} panelCount={panelsPerSet} />}
    </div>
  );
}
