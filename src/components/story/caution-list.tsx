import { UnreviewedBadge } from "@/components/badges";
import { messagesFor, type Locale } from "@/lib/i18n";
import { storyMessages } from "@/lib/i18n/messages/story";
import type { StoryClaimView, StoryViewModel } from "./types";

export function CautionList({
  locale,
  cautions,
  labels,
  numbers,
}: {
  locale: Locale;
  cautions: readonly StoryClaimView[];
  labels: StoryViewModel["cautionLabels"];
  numbers: ReadonlyMap<string, number>;
}): React.JSX.Element {
  const messages = messagesFor(storyMessages, locale);
  return (
    <section aria-label={messages.cautionsHeading} className="space-y-3">
      <h3 className="font-sans text-[18px] font-bold">{messages.cautionsHeading}</h3>
      <ul className="list-disc space-y-2 pl-5">
        {cautions.map((claim) => {
          const key = claim.cautionType ?? "";
          const label = labels[key];
          return (
            <li key={claim.id}>
              {label?.label ?? key}{" "}
              <sup>
                <a
                  id={`caution-ref-${claim.id}`}
                  href={`#fn-${claim.id}`}
                  className="text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {numbers.get(claim.id)}
                </a>
              </sup>{" "}
              {(!label || !label.reviewed) && <UnreviewedBadge locale={locale} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
