import { MachineTranslationBadge, UnconfirmedBadge } from "@/components/badges";
import { platformName } from "@/components/embeds/platform-name";
import { labelForCategory } from "@/components/public/category";
import { placeHeading, type PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { walkMessages } from "@/lib/i18n/messages/walk";
import type { CardView } from "@/lib/walk/controller";

const LINK = "inline-flex min-h-11 items-center font-bold text-ai underline";
const BUTTON =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-2 text-[17px] font-bold text-white disabled:opacity-50";
const QUIET_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-input px-4 py-2 font-bold text-kon";

export type WalkCardActions = {
  readAloud(cardId: number): void;
  dismiss(): void;
};

const primary = (tag: string) => tag.toLowerCase().replace(/_/g, "-").split("-")[0] ?? "";

/** A language's name in the reader's language: "Japanese" or "日本語". */
function languageName(lang: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(primary(lang)) ?? lang;
  } catch {
    return lang;
  }
}

/**
 * One card on a walk: a story near you, a place nobody has written about, or a detour. A card always
 * says what the words are (a person's, Noren's AI's, a machine translation) before it shows them.
 */
export function WalkCard({
  locale,
  region,
  card,
  planner,
  localVoices,
  actions,
  compact = false,
}: {
  locale: Locale;
  region: PublicRegionProps;
  card: CardView;
  planner: boolean;
  localVoices: number;
  actions: WalkCardActions;
  /** An earlier card: no buttons beyond the links. */
  compact?: boolean;
}) {
  const m = messagesFor(walkMessages, locale);
  const write = messagesFor(addStoryMessages, locale).write;
  const { place } = card;
  const heading = placeHeading(place.names, locale, region);
  const category = place.category ? labelForCategory(region, place.category, locale) : undefined;
  const pagePath = localePath(locale, `/places/${encodeURIComponent(place.slug)}`);
  const newTab = { target: "_blank", rel: "noopener" } as const;
  const narration = card.narration;
  return (
    <article
      data-walk-card={card.kind}
      data-place={place.slug}
      aria-labelledby={`walk-card-${card.id}`}
      className="space-y-3 rounded-[10px] border-2 border-kon bg-white p-4 text-[17px] leading-relaxed"
    >
      <header className="space-y-1">
        <p className="text-[15px] font-bold text-muted-foreground">
          {card.kind === "detour"
            ? place.hasStory
              ? format(m.detourPlace, { minutes: card.minutes ?? 0 })
              : format(m.detourLane, { minutes: card.minutes ?? 0 })
            : `${m.nearYou} · ${format(m.metresAway, { metres: card.metres.toLocaleString(locale) })}`}
        </p>
        <h2
          id={`walk-card-${card.id}`}
          lang={heading.primary.lang}
          className="text-[24px] leading-snug font-bold [overflow-wrap:anywhere]"
        >
          {heading.primary.text}
        </h2>
        {heading.secondary && (
          <p lang={heading.secondary.lang} className="text-[15px] text-muted-foreground">
            {heading.secondary.text}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
          {category && <span>{category}</span>}
          {!place.confirmed && <UnconfirmedBadge locale={locale} />}
        </p>
      </header>

      {card.kind === "story" && narration && (
        <div className="space-y-2">
          <p className="font-bold">{narration.intro}</p>
          {narration.machineTranslated && <MachineTranslationBadge locale={locale} />}
          {narration.bodyLang !== undefined && (
            <blockquote
              lang={narration.bodyLang}
              className="border-l-4 border-kasutera pl-3 text-[19px] leading-[1.8] whitespace-pre-wrap"
            >
              {narration.body}
            </blockquote>
          )}
          {narration.bodyLang !== undefined && primary(narration.bodyLang) !== locale && (
            <p className="text-[15px] text-muted-foreground">
              {format(m.writtenIn, { language: languageName(narration.bodyLang, locale) })}
            </p>
          )}
          {place.snippet?.kind === "stitched" && (
            <p role="note" className="text-[15px]">
              {format(m.aiNote, { count: place.snippet.postsRead })}{" "}
              {format(m.aiSources, {
                platforms: place.snippet.platforms
                  .map((platform) => platformName(platform) ?? m.webPages)
                  .filter((name, index, all) => all.indexOf(name) === index)
                  .join(locale === "ja" ? "、" : ", "),
              })}
            </p>
          )}
          {place.snippet?.kind === "post" && <p className="text-[15px]">{m.postNote}</p>}
          {!compact && (
            <div className="space-y-2">
              {card.voice.ok ? (
                <button
                  type="button"
                  className={QUIET_BUTTON}
                  onClick={() => actions.readAloud(card.id)}
                >
                  {m.readAloud}
                </button>
              ) : (
                <p role="note" className="text-[15px] text-muted-foreground">
                  {localVoices === 0 || card.voice.missing.length === 0
                    ? m.noVoiceAtAll
                    : format(m.noVoice, {
                        language: card.voice.missing
                          .map((lang) => languageName(lang, locale))
                          .join(locale === "ja" ? "、" : ", "),
                      })}
                </p>
              )}
            </div>
          )}
          <a className={LINK} href={`${pagePath}?tab=stories`} {...newTab}>
            {narration.more ? m.readWhole : m.readStories}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
        </div>
      )}

      {card.kind === "story" && !narration && (
        <div className="space-y-2">
          <p>{m.hasStoryNoWords}</p>
          <a className={LINK} href={`${pagePath}?tab=stories`} {...newTab}>
            {m.readStories}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
        </div>
      )}

      {card.kind === "first-story" && (
        <div className="space-y-2">
          <p className="font-bold">{format(m.firstStory, { name: heading.primary.text })}</p>
          <a className={BUTTON} href={`${pagePath}?tab=stories&write=1`} {...newTab}>
            {write}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
          <p className="text-[15px] text-muted-foreground">{m.newTab}</p>
        </div>
      )}

      {card.kind === "detour" && (
        <div className="space-y-2">
          <p role="note" className="text-[15px] text-muted-foreground">
            {m.randomPick}
          </p>
          <a className={LINK} href={pagePath} {...newTab}>
            {m.openPlace}
            <span className="sr-only"> ({m.newTab})</span>
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4">
        {planner && (
          <a
            className={LINK}
            href={`${localePath(locale, "/plan")}?place=${encodeURIComponent(place.slug)}`}
          >
            {m.askAbout}
          </a>
        )}
        {!compact && (
          <button type="button" className={`${LINK} text-kon`} onClick={actions.dismiss}>
            {m.close}
          </button>
        )}
      </div>
    </article>
  );
}
