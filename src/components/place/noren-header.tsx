import { DemoBadge } from "@/components/badges";
import {
  placeHeading,
  type PlaceDetailLike,
  type PublicRegionProps,
} from "@/components/public/mapping";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";

export function NorenHeader({
  locale,
  place,
  region,
  category,
  hasStory,
}: {
  locale: Locale;
  place: Pick<PlaceDetailLike, "names" | "isMock">;
  region: Pick<PublicRegionProps, "defaultLocale" | "nameFallback">;
  category?: string;
  hasStory: boolean;
}) {
  const m = messagesFor(placePageMessages, locale);
  const heading = placeHeading(place.names, locale, region);
  const japaneseNames = place.names.filter(
    (name) => name.lang === "ja" && (name.script === "kanji" || name.script === "kana"),
  );
  const japanese =
    japaneseNames.find((name) => name.value === heading.primary.text) ??
    japaneseNames.find((name) => name.isPrimary) ??
    japaneseNames[0];
  const alternate =
    place.names.find((name) => name.lang === "en") ??
    place.names.find((name) => name.script === "romaji");
  const clothName = japanese ? { text: japanese.value, lang: japanese.lang } : heading.primary;
  const clothIsPrimary =
    clothName.text === heading.primary.text && clothName.lang === heading.primary.lang;
  const otherName = clothIsPrimary
    ? japanese
      ? alternate
        ? { text: alternate.value, lang: alternate.lang }
        : null
      : heading.secondary
    : heading.primary;
  const ClothName = clothIsPrimary ? "h1" : "p";
  const OtherName = clothIsPrimary ? "p" : "h1";
  const nameLength = Array.from(clothName.text).length;
  const vertical = Boolean(japanese) && nameLength <= 28;
  return (
    <header className="min-w-0 space-y-4">
      <style>{`
        @keyframes noren-drop {
          from { transform: translateY(-100%); }
          to { transform: translateY(0) rotate(1deg); }
        }
        @keyframes noren-settle {
          from { transform: rotate(1deg); }
          to { transform: rotate(0); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .noren-cloth { animation: noren-drop 420ms ease-out both, noren-settle 180ms ease-out 420ms forwards; }
        }
      `}</style>
      <div className="noren-cloth relative isolate h-[240px] w-full origin-top bg-kon text-white [--slit-height:72px] sm:h-[280px] sm:[--slit-height:84px]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <span className="absolute bottom-0 left-1/3 h-[var(--slit-height)] w-[6px] -translate-x-1/2 bg-background" />
          <span className="absolute bottom-0 left-2/3 h-[var(--slit-height)] w-[6px] -translate-x-1/2 bg-background" />
        </div>
        <div className="relative flex h-full min-w-0 items-center justify-center px-6 pt-5 pb-[calc(var(--slit-height)+12px)]">
          <ClothName
            lang={clothName.lang}
            aria-label={clothName.text}
            className={
              vertical
                ? nameLength > 14
                  ? "h-full max-w-full shrink-0 font-display text-[26px] leading-[1.2] font-extrabold [overflow-wrap:anywhere] [writing-mode:vertical-rl] sm:text-[34px]"
                  : "h-full max-w-full shrink-0 font-display text-[32px] leading-[1.2] font-extrabold [overflow-wrap:anywhere] [writing-mode:vertical-rl] sm:text-[40px]"
                : "line-clamp-3 min-w-0 max-w-full font-display text-center text-[32px] leading-[1.2] font-bold [overflow-wrap:anywhere]"
            }
          >
            {clothName.text}
          </ClothName>
        </div>
      </div>
      {otherName && (
        <OtherName
          lang={otherName.lang}
          className="font-display text-[28px] leading-normal font-bold [overflow-wrap:anywhere]"
        >
          {otherName.text}
        </OtherName>
      )}
      <p>
        {category
          ? format(m.categoryInRegion, { category, region: m.regionName })
          : format(m.inRegion, { region: m.regionName })}
      </p>
      {(hasStory || place.isMock) && (
        <div className="flex flex-wrap items-center gap-2">
          {hasStory && (
            <span
              data-badge="story"
              className="inline-flex items-center gap-2 rounded-full bg-kasutera px-3 py-1 text-[13px] font-bold text-kon"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-current">
                <path d="M2 2h12v12H9v-4H7v4H2z" />
              </svg>
              {m.story}
            </span>
          )}
          {place.isMock && <DemoBadge locale={locale} />}
        </div>
      )}
    </header>
  );
}
