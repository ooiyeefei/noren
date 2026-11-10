import Link from "next/link";
import { AiAssistedBadge, DemoBadge, MachineTranslationBadge } from "@/components/badges";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";
import { plannerMessages } from "@/lib/i18n/messages/planner";
import type { PlannerQuote } from "@/lib/planner/reply";

// Words someone wrote, shown the way the place page shows them: verbatim, with the writer's name,
// and with the same labels (machine translation, stitched by Noren's AI). Nothing here is rewritten.

function dateLabel(locale: Locale, day: string): string {
  const when = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(when)
    ? day
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(when);
}

export function QuoteView({
  locale,
  quote,
  withPlace = false,
}: {
  locale: Locale;
  quote: PlannerQuote;
  /** Name the place above the words, when they are shown away from their place. */
  withPlace?: boolean;
}): React.JSX.Element {
  const ui = messagesFor(plannerMessages, locale);
  const page = messagesFor(placePageMessages, locale);
  const text = locale === "ja" && quote.textJa !== undefined ? quote.textJa : quote.text;
  const textLang = quote.kind === "stitched" ? locale : quote.language;
  const date = quote.on === undefined ? null : dateLabel(locale, quote.on);
  const placeHref = localePath(locale, `/places/${encodeURIComponent(quote.slug)}`);

  return (
    <figure
      className="space-y-2 rounded-[10px] border border-line bg-white p-3"
      data-quote-kind={quote.kind}
    >
      {withPlace && (
        <figcaption className="text-[15px] font-bold">
          <Link className="text-ai underline" href={placeHref}>
            {quote.placeName}
          </Link>
        </figcaption>
      )}
      <blockquote
        lang={textLang}
        className="text-[17px] leading-[1.8] break-words whitespace-pre-wrap"
      >
        {text}
        {quote.kind === "stitched" &&
          quote.sources.map((source) => (
            <sup key={source.number} className="ml-0.5 text-[13px]">
              <a
                href={`#${quote.id}-source-${source.number}`}
                aria-label={format(page.agentStoryNote, { number: String(source.number) })}
                className="text-ai underline"
              >
                {source.number}
              </a>
            </sup>
          ))}
      </blockquote>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
        {quote.kind === "story" && quote.by !== undefined && (
          <span className="font-bold text-kon">{format(page.writtenBy, { name: quote.by })}</span>
        )}
        {quote.kind === "found" && (
          <span>
            {quote.by === undefined ? ui.foundByAnon : format(ui.foundBy, { name: quote.by })}
          </span>
        )}
        {quote.kind === "owner" && <span className="font-bold text-kon">{page.ownersWords}</span>}
        {date !== null && <time dateTime={quote.on}>{date}</time>}
        {quote.kind === "found" && quote.link !== undefined && (
          <a
            href={quote.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-ai underline"
          >
            {ui.originalPost}
          </a>
        )}
        {quote.demo && <DemoBadge locale={locale} />}
        {quote.aiAssisted && <AiAssistedBadge locale={locale} />}
      </p>

      {quote.topic !== undefined && (
        <p className="text-[15px]">{format(ui.topic, { topic: quote.topic[locale] })}</p>
      )}

      {quote.translations.map((translation) => (
        <div key={translation.language} className="space-y-1 border-t border-line pt-2">
          {translation.origin === "machine" ? (
            <MachineTranslationBadge locale={locale} />
          ) : (
            <span className="text-[13px] text-muted-foreground">{ui.humanTranslation}</span>
          )}
          <p lang={translation.language} className="text-[16px] leading-[1.7] break-words">
            {translation.text}
          </p>
        </div>
      ))}

      {quote.kind === "stitched" && (
        <div className="space-y-2 border-t border-line pt-2">
          {quote.postsRead !== undefined && (
            <p role="note" className="text-[14px]">
              {format(page.agentStoryLabel, { count: String(quote.postsRead) })}
            </p>
          )}
          <ol className="space-y-2 text-[14px]">
            {quote.sources.map((source) => (
              <li
                key={source.number}
                id={`${quote.id}-source-${source.number}`}
                className="flex gap-2"
              >
                <span aria-hidden="true" className="font-bold">
                  {source.number}
                </span>
                <span className="min-w-0 space-y-1">
                  <q lang={source.language} className="block break-words">
                    {source.words}
                  </q>
                  <a
                    href={source.link}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-ai underline"
                  >
                    {[source.platform, source.author, source.on].filter(Boolean).join(", ") ||
                      page.agentStoryWebPage}
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </figure>
  );
}
