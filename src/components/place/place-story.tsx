import { platformName } from "@/components/embeds/platform-name";
import { outboundPath } from "@/lib/http/outbound";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { placePageMessages } from "@/lib/i18n/messages/place-page";

export type PlaceStoryLike = {
  sentences: readonly { en: string; ja: string; notes: readonly number[] }[];
  notes: readonly {
    sourceId: string;
    words: string;
    lang?: string;
    platform?: string;
    canonicalUrl: string;
    authorHandle?: string;
    postedAt?: number;
    countsVisits: boolean;
  }[];
  postsRead: number;
};

const noteId = (index: number) => `story-note-${index + 1}`;

/**
 * The place's story as the story agent wrote it: labelled as AI, with every sentence numbered to the
 * exact words behind it and each of those linked to the post they came from.
 */
export function PlaceStory({ locale, story }: { locale: Locale; story: PlaceStoryLike }) {
  const ui = messagesFor(placePageMessages, locale);
  const month = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <section className="space-y-4 border-t border-line pt-10" aria-labelledby="place-story-heading">
      <h2 id="place-story-heading" className="font-sans text-[22px] font-bold">
        {ui.agentStory}
      </h2>
      <p className="text-[18px] leading-relaxed">
        {story.sentences.map((sentence, index) => (
          <span key={index}>
            {index > 0 && " "}
            {locale === "ja" ? sentence.ja : sentence.en}
            {sentence.notes.map((note) => (
              <sup key={note} className="ml-0.5 text-[13px]">
                <a
                  href={`#${noteId(note)}`}
                  aria-label={format(ui.agentStoryNote, { number: String(note + 1) })}
                  className="text-ai underline"
                >
                  {note + 1}
                </a>
              </sup>
            ))}
          </span>
        ))}
      </p>
      <p role="note" className="max-w-prose text-[15px]">
        {format(ui.agentStoryLabel, { count: String(story.postsRead) })}
      </p>
      <ol className="space-y-3 text-[15px]">
        {story.notes.map((note, index) => {
          const credit = [
            platformName(note.platform) ?? ui.agentStoryWebPage,
            note.authorHandle,
            note.postedAt === undefined ? undefined : month.format(note.postedAt),
          ].filter(Boolean);
          return (
            <li key={index} id={noteId(index)} className="flex min-w-0 gap-2">
              <span aria-hidden="true" className="font-bold">
                {index + 1}
              </span>
              <span className="min-w-0 space-y-1">
                <q lang={note.lang} className="block break-words">
                  {note.words}
                </q>
                <a
                  href={note.countsVisits ? outboundPath(note.sourceId) : note.canonicalUrl}
                  target="_blank"
                  rel={note.countsVisits ? "noopener" : "noopener noreferrer nofollow"}
                  className="text-ai underline"
                >
                  {credit.join(", ")}
                </a>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
