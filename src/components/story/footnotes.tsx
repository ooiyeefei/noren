import { AiAssistedBadge, DemoBadge } from "@/components/badges";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { storyMessages } from "@/lib/i18n/messages/story";
import type { StoryClaimView } from "./types";

export function Footnotes({
  locale,
  claims,
  numbers,
  firstReferences,
}: {
  locale: Locale;
  claims: readonly StoryClaimView[];
  numbers: ReadonlyMap<string, number>;
  firstReferences?: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const messages = messagesFor(storyMessages, locale);
  const ordered = claims
    .filter((claim) => numbers.has(claim.id))
    .sort((a, b) => numbers.get(a.id)! - numbers.get(b.id)!);
  return (
    <section
      aria-label={messages.footnotesHeading}
      className="space-y-3 text-[15px] leading-relaxed text-muted-foreground"
    >
      <h3 className="font-sans text-[18px] font-bold">{messages.footnotesHeading}</h3>
      <ol className="list-decimal space-y-4 pl-6">
        {ordered.map((claim) => (
          <li
            key={claim.id}
            id={`fn-${claim.id}`}
            value={numbers.get(claim.id)}
            className="scroll-mt-4 space-y-2 [overflow-wrap:anywhere]"
          >
            {claim.origin === "interview" && (
              <>
                <p>
                  {claim.confirmedAt !== undefined
                    ? format(messages.interviewConfirmed, {
                        date: new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
                          claim.confirmedAt,
                        ),
                      })
                    : null}
                </p>
                {claim.quote && (
                  <blockquote lang={claim.langOriginal} className="border-l-2 pl-3">
                    {claim.quote}
                  </blockquote>
                )}
              </>
            )}
            {claim.origin === "open_text" && claim.openText && (
              <p>
                {messages.fromOpenText}: {claim.openText.attribution}. {messages.licence}:{" "}
                {claim.openText.licence}.{" "}
                <a
                  href={claim.openText.sourceUrl}
                  rel="noopener noreferrer"
                  className="text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {claim.openText.sourceUrl}
                </a>
                {claim.openText.revisionRef && (
                  <>
                    {" "}
                    {messages.revision}: {claim.openText.revisionRef}
                  </>
                )}
              </p>
            )}
            {claim.aiAssisted && <AiAssistedBadge locale={locale} />}
            {claim.isMock && <DemoBadge locale={locale} />}
            {firstReferences?.has(claim.id) && (
              <a
                className="block text-sm text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2"
                href={`#${firstReferences.get(claim.id)}`}
              >
                {messages.backToReference}
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
