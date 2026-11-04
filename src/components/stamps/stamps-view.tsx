import { checkDate } from "@/components/place/check-state";
import { placeHeading, type NameLike } from "@/components/public/mapping";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { stampMessages } from "@/lib/i18n/messages/stamps";
import { StampInk, StampSeal, stampName, type StampRegion } from "./stamp";

export type StampLike = {
  placeId: string;
  slug: string;
  names: readonly NameLike[];
  stampedAt: number;
};

/** A personal collection with no total: it shows the stamps and never says how many (FR-015). */
export function StampsView({
  locale,
  region,
  stamps,
}: {
  locale: Locale;
  region: StampRegion;
  /** Undefined while loading. */
  stamps?: readonly StampLike[];
}) {
  const m = messagesFor(stampMessages, locale);
  return (
    <div lang={locale} className="space-y-6 text-kon" data-stamp-book="">
      <p className="max-w-prose text-[17px]">{m.intro}</p>
      {stamps?.length === 0 && (
        <div
          data-stamp-empty=""
          className="space-y-3 rounded-[14px] border border-dashed border-line p-6"
        >
          <p className="max-w-prose text-[17px]">{m.empty}</p>
          <a
            className="inline-flex min-h-11 items-center text-ai underline"
            href={localePath(locale)}
          >
            {m.goToMap}
          </a>
        </div>
      )}
      {stamps && stamps.length > 0 && (
        <>
          <StampInk />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {stamps.map((stamp) => {
              const heading = placeHeading(stamp.names, locale, region);
              const name = stampName(stamp.names, locale, region);
              return (
                <li key={stamp.placeId}>
                  <a
                    data-stamp={stamp.slug}
                    href={localePath(locale, `/places/${encodeURIComponent(stamp.slug)}`)}
                    className="group flex flex-col items-center gap-3 rounded-[10px] p-2 text-center hover:bg-kamenozoki"
                  >
                    <StampSeal name={name} seed={stamp.slug} />
                    <span className="min-w-0 space-y-0.5">
                      <span
                        lang={heading.primary.lang}
                        className="block font-bold [overflow-wrap:anywhere] group-hover:underline"
                      >
                        {heading.primary.text}
                      </span>
                      <time
                        dateTime={new Date(stamp.stampedAt).toISOString()}
                        className="block text-[13px] text-muted-foreground"
                      >
                        {checkDate(stamp.stampedAt, locale)}
                      </time>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
