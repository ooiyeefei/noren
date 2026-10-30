import { AiAssistedBadge, DemoBadge } from "@/components/badges";
import { Separator } from "@/components/ui/separator";
import { messagesFor } from "@/lib/i18n";
import { storyMessages } from "@/lib/i18n/messages/story";
import { cautions, disputedPairs, footnoteOrder, sentencesFor } from "./group";
import { Sentence } from "./sentence";
import { Footnotes } from "./footnotes";
import { DisputedClaims } from "./disputed-claims";
import { CautionList } from "./caution-list";
import type { StoryViewModel } from "./types";

export function StoryView({ story }: { story: StoryViewModel }): React.JSX.Element {
  const { locale } = story;
  const messages = messagesFor(storyMessages, locale);
  const sentences = sentencesFor(story);
  const claims = new Map(story.claims.map((claim) => [claim.id, claim]));
  const numbers = new Map(footnoteOrder(story).map(({ claimId, number }) => [claimId, number]));
  const orderedClaims = [...numbers.keys()].flatMap((id) => {
    const claim = claims.get(id);
    return claim ? [claim] : [];
  });
  const pairs = disputedPairs(orderedClaims);
  const cautionClaims = cautions(story.claims);
  const firstReferences = new Map<string, string>();
  for (const sentence of sentences)
    for (const id of sentence.claimIds)
      if (!firstReferences.has(id))
        firstReferences.set(id, `ref-${sentence.lang}-${sentence.ordinal}-${id}`);
  for (const claim of cautionClaims)
    if (!firstReferences.has(claim.id)) firstReferences.set(claim.id, `caution-ref-${claim.id}`);
  for (const pair of pairs)
    for (const claim of pair)
      if (!firstReferences.has(claim.id)) firstReferences.set(claim.id, `disputed-ref-${claim.id}`);
  const mock = sentences.some((sentence) => sentence.claimIds.some((id) => claims.get(id)?.isMock));
  return (
    <article lang={locale} className="space-y-6 break-words">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-sans text-[22px] font-bold">{messages.storyHeading}</h2>
        {story.aiComposed && <AiAssistedBadge locale={locale} />}
        {mock && <DemoBadge locale={locale} />}
      </header>
      {sentences.length ? (
        <div className="space-y-4">
          {sentences.map((sentence) => (
            <Sentence
              key={`${sentence.lang}-${sentence.ordinal}`}
              locale={locale}
              sentence={sentence}
              claims={claims}
              numbers={numbers}
            />
          ))}
        </div>
      ) : (
        <p>{messages.noStoryYet}</p>
      )}
      {pairs.length > 0 && <DisputedClaims locale={locale} pairs={pairs} numbers={numbers} />}
      {cautionClaims.length > 0 && (
        <CautionList
          locale={locale}
          cautions={cautionClaims}
          labels={story.cautionLabels}
          numbers={numbers}
        />
      )}
      {numbers.size > 0 && (
        <>
          <Separator />
          <Footnotes
            locale={locale}
            claims={orderedClaims}
            numbers={numbers}
            firstReferences={firstReferences}
          />
        </>
      )}
    </article>
  );
}
