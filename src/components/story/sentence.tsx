import { MachineTranslationBadge, TranslationPendingBadge } from "@/components/badges";
import { messagesFor, type Locale } from "@/lib/i18n";
import { storyMessages } from "@/lib/i18n/messages/story";
import type { StoryClaimView, StorySentenceView } from "./types";

export function Sentence({
  locale,
  sentence,
  claims,
  numbers,
}: {
  locale: Locale;
  sentence: StorySentenceView;
  claims: ReadonlyMap<string, StoryClaimView>;
  numbers: ReadonlyMap<string, number>;
}): React.JSX.Element {
  const messages = messagesFor(storyMessages, locale);
  const cited = [...new Set(sentence.claimIds)].flatMap((id) => {
    const claim = claims.get(id);
    return claim ? [claim] : [];
  });
  return (
    <div className="space-y-2 text-[18px] leading-[1.8]">
      <p>
        <span lang={sentence.textLang}>{sentence.text}</span>
        {cited.map((claim) => (
          <sup key={claim.id} className="ml-1">
            <a
              className="text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2"
              href={`#fn-${claim.id}`}
              id={`ref-${sentence.lang}-${sentence.ordinal}-${claim.id}`}
            >
              {numbers.get(claim.id)}
            </a>
          </sup>
        ))}
      </p>
      {sentence.translation === "machine" && <MachineTranslationBadge locale={locale} />}
      {sentence.textLang !== locale && <TranslationPendingBadge locale={locale} />}
      {cited.some((claim) => claim.status === "disputed") && (
        <a
          href="#disputed"
          className="block text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {messages.accountsDiffer}
        </a>
      )}
      {sentence.translation !== "original" && (
        <details>
          <summary className="min-h-11 cursor-pointer text-[15px] text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2">
            {messages.showOriginal}
          </summary>
          {cited.map((claim) => (
            <p key={claim.id} lang={claim.langOriginal} className="mt-2">
              {claim.textOriginal}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
