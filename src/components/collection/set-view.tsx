import { neighbourhoodName } from "@/components/explore/mission-bar";
import { placeHeading, type PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { Finished } from "./finished";
import { NextPanelCard, type SetLike } from "./next-panel-card";
import { Noren } from "./noren";

/** A neighbourhood's noren as this person has it, and the places that fill its panels. */
export function SetView({
  locale,
  region,
  set,
  signedIn,
}: {
  locale: Locale;
  region: Pick<PublicRegionProps, "defaultLocale" | "nameFallback">;
  set: SetLike;
  /** Undefined while sign-in is still loading. */
  signedIn: boolean | undefined;
}) {
  const m = messagesFor(collectionMessages, locale);
  const name = neighbourhoodName(set.names, locale);
  const dyed = set.panels.filter((panel) => panel.dyed).length;
  return (
    <div
      lang={locale}
      className="grid max-w-[560px] gap-6 text-kon lg:max-w-none lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start lg:gap-12"
      data-set={set.neighbourhoodId}
    >
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[18px] font-bold">
            {format(m.progress, { dyed: String(dyed), total: String(set.panelCount) })}
          </p>
          {signedIn && <p className="text-[13px] text-muted-foreground">{m.onlyYou}</p>}
        </div>
        <Noren locale={locale} name={name} panels={set.panels} panelCount={set.panelCount} />
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
        {set.finished && set.wholeArtUrl ? (
          <Finished
            locale={locale}
            name={name}
            fileName={`noren-${set.neighbourhoodId}.png`}
            wholeArtUrl={set.wholeArtUrl}
            finishedOn={set.finishedOn}
          />
        ) : (
          <NextPanelCard locale={locale} region={region} set={set} />
        )}
      </div>
      <div className="min-w-0 space-y-6">
        <section className="space-y-2">
          <h2 className="text-[22px] font-bold">{format(m.panelsHeading, { name })}</h2>
          <ol>
            {set.panels.map((panel) => (
              <li
                key={panel.index}
                data-set-panel={panel.index}
                className="flex items-baseline gap-3 border-t border-line py-3"
              >
                <span className="w-5 shrink-0 font-display font-extrabold">{panel.index + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {panel.places.length === 0 && (
                    <p className="text-[15px] text-muted-foreground">{m.placesWaiting}</p>
                  )}
                  {panel.places.map((place) => {
                    const heading = placeHeading(place.names, locale, region).primary;
                    return (
                      <a
                        key={place.placeId}
                        lang={heading.lang}
                        className="block min-h-11 py-2 text-ai underline [overflow-wrap:anywhere]"
                        href={`${localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}?tab=visit`}
                      >
                        {heading.text}
                      </a>
                    );
                  })}
                  {panel.dyed && <p className="text-[13px] text-muted-foreground">{m.panelDyed}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <a
          className="inline-flex min-h-11 items-center text-ai underline"
          href={localePath(locale, "/collection")}
        >
          {m.backToBook}
        </a>
      </div>
    </div>
  );
}
