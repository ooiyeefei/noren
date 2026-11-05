import { MachineTranslationBadge } from "@/components/badges/machine-translation-badge";
import { platformName } from "@/components/embeds/platform-name";
import { NorenTab } from "@/components/explore/noren-tab";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { quoted } from "@/components/embeds/quoted";
import { placeHeading, type LatestStoryLike, type PublicRegionProps } from "./mapping";

/** FR-033: the newest stories people shared, each a way into the place it is about. */
export function LatestStories({
  locale,
  region,
  entries,
}: {
  locale: Locale;
  region: Pick<PublicRegionProps, "nameFallback" | "defaultLocale">;
  entries: readonly LatestStoryLike[];
}) {
  const m = messagesFor(publicMessages, locale);
  return (
    <section aria-labelledby="latest-stories" className="pb-3">
      <h2 id="latest-stories" className="px-4 pb-2 text-[15px] font-bold">
        {m.latestStories}
      </h2>
      <ul className="flex gap-3 overflow-x-auto px-4 pb-1 lg:flex-col lg:overflow-visible">
        {entries.map((entry) => {
          const name = placeHeading(entry.placeNames, locale, region).primary;
          const platform = platformName(entry.platform);
          const credit =
            entry.kind === "written"
              ? format(m.writtenBy, { name: entry.sharedBy })
              : entry.found
                ? platform
                  ? format(m.foundPost, { platform })
                  : m.foundPage
                : platform
                  ? format(m.postSharedBy, { platform, name: entry.sharedBy })
                  : format(m.linkSharedBy, { name: entry.sharedBy });
          const translation =
            entry.lang === locale
              ? undefined
              : entry.translations?.find((row) => row.lang === locale)?.text;
          return (
            <li
              key={`${entry.kind}:${entry.id}`}
              className="w-[260px] shrink-0 lg:w-auto lg:nth-[n+4]:hidden"
            >
              <a
                href={localePath(locale, `/places/${entry.placeSlug}`)}
                className="flex h-full flex-col gap-2 rounded-[12px] border border-line bg-white p-3 hover:bg-kamenozoki"
              >
                <span className="flex items-center gap-2 text-[15px] font-bold">
                  <NorenTab story />
                  <span lang={name.lang} className="min-w-0 truncate">
                    {name.text}
                  </span>
                </span>
                {entry.text && (
                  <span
                    lang={entry.lang}
                    className={`${translation ? "line-clamp-2" : "line-clamp-3"} text-[15px] leading-relaxed`}
                  >
                    {entry.found ? quoted(entry.text, entry.lang) : entry.text}
                  </span>
                )}
                {translation && (
                  <span className="line-clamp-3 text-[15px] leading-relaxed text-muted-foreground">
                    {translation}
                  </span>
                )}
                <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                  {credit}
                  {translation && <MachineTranslationBadge locale={locale} />}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
