import { messagesFor, type Locale } from "@/lib/i18n";
import { storyMessages } from "@/lib/i18n/messages/story";
import type { StoryClaimView } from "./types";

export function DisputedClaims({
  locale,
  pairs,
  numbers,
}: {
  locale: Locale;
  pairs: readonly [StoryClaimView, StoryClaimView][];
  numbers?: ReadonlyMap<string, number>;
}): React.JSX.Element {
  const messages = messagesFor(storyMessages, locale);
  return (
    <section id="disputed" aria-labelledby="disputed-heading" className="space-y-3">
      <h3 id="disputed-heading" className="font-sans text-[18px] font-bold">
        {messages.accountsDiffer}
      </h3>
      <p>{messages.accountsDifferIntro}</p>
      {pairs.map((pair) => (
        <div
          key={JSON.stringify(pair.map((claim) => claim.id))}
          className="grid gap-3 sm:grid-cols-2"
        >
          {pair.map((claim) => (
            <div key={claim.id} className="space-y-2 border-l border-line pl-4">
              <p lang={claim.langOriginal}>{claim.textOriginal}</p>
              <a
                id={`disputed-ref-${claim.id}`}
                href={`#fn-${claim.id}`}
                className="text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {numbers?.get(claim.id) ?? claim.id}
              </a>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
