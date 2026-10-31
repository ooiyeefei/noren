import { platformName } from "@/components/embeds/platform-name";
import { NorenTab } from "@/components/explore/noren-tab";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
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
      <ul className="flex gap-3 overflow-x-auto px-4 pb-1">
        {entries.map((entry) => {
          const name = placeHeading(entry.placeNames, locale, region).primary;
          const platform = platformName(entry.platform);
          const credit =
            entry.kind === "written"
              ? format(m.writtenBy, { name: entry.sharedBy })
              : platform
                ? format(m.postSharedBy, { platform, name: entry.sharedBy })
                : format(m.linkSharedBy, { name: entry.sharedBy });
          return (
            <li key={`${entry.kind}:${entry.id}`} className="w-[260px] shrink-0">
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
                  <span lang={entry.lang} className="line-clamp-3 text-[15px] leading-relaxed">
                    {entry.text}
                  </span>
                )}
                <span className="mt-auto text-[13px] text-muted-foreground">{credit}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
