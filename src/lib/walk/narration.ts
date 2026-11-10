import { format, type Locale } from "@/lib/i18n";
import type { WalkMessageTable } from "@/lib/i18n/messages/walk";
import type { SpeechPart } from "./voice";
import type { Snippet } from "./types";

// What a card says and, when sound is on, what the phone reads: the credit first, then the words.
// Whatever kind of text it is, the introduction says so before the words: a person's story names
// its writer, Noren's AI stitching says it is AI, a translation says it is a machine's.

export type Narration = {
  kind: Snippet["kind"];
  /** The credit or label that comes first. */
  intro: string;
  /** The words, word for word. */
  body: string;
  /** The language the words are in; unknown for a quote whose language could not be told. */
  bodyLang: string | undefined;
  /** The body is a machine translation of the original. */
  machineTranslated: boolean;
  /** The words were cut short, so the whole is on the place page. */
  more: boolean;
  /** What is read aloud, in order. Empty when the language of the words is unknown. */
  parts: SpeechPart[];
};

const primary = (tag: string) => tag.toLowerCase().replace(/_/g, "-").split("-")[0] ?? "";

export function narrate(snippet: Snippet, locale: Locale, m: WalkMessageTable): Narration {
  const parts = (intro: string, body: string, bodyLang: string | undefined): SpeechPart[] =>
    bodyLang === undefined
      ? []
      : [
          { text: intro, lang: locale },
          { text: body, lang: bodyLang },
        ];

  if (snippet.kind === "member") {
    const name = snippet.writer.trim();
    const intro = name === "" ? m.introMemberAnon : format(m.introMember, { name });
    return {
      kind: "member",
      intro,
      body: snippet.text,
      bodyLang: snippet.lang,
      machineTranslated: false,
      more: snippet.more,
      parts: parts(intro, snippet.text, snippet.lang),
    };
  }

  if (snippet.kind === "stitched") {
    // The AI wrote the story in both languages, so the reader's language is always there.
    const body = snippet.sentences.map((sentence) => sentence[locale]).join(" ");
    return {
      kind: "stitched",
      intro: m.introStitched,
      body,
      bodyLang: locale,
      machineTranslated: false,
      more: false,
      parts: parts(m.introStitched, body, locale),
    };
  }

  // A found post: its own words, or a machine translation into the reader's language if the post
  // is in another one and a translation exists.
  const author = snippet.author?.trim() ?? "";
  const translation =
    snippet.lang !== undefined && primary(snippet.lang) !== locale
      ? snippet.translations.find((candidate) => primary(candidate.lang) === locale)
      : undefined;
  if (translation !== undefined) {
    const intro = author === "" ? m.introMachineAnon : format(m.introMachine, { author });
    return {
      kind: "post",
      intro,
      body: translation.text,
      bodyLang: locale,
      machineTranslated: true,
      more: snippet.more,
      parts: parts(intro, translation.text, locale),
    };
  }
  const intro = author === "" ? m.introPostAnon : format(m.introPost, { author });
  return {
    kind: "post",
    intro,
    body: snippet.text,
    bodyLang: snippet.lang,
    machineTranslated: false,
    more: snippet.more,
    parts: parts(intro, snippet.text, snippet.lang),
  };
}
