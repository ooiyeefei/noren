import { messagesFor, type Locale } from "@/lib/i18n";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";
import { cn } from "@/lib/utils";

const POSTER = "/film/noren-intro.jpg";

/**
 * One cut of the film per language. Each has its own captions, timed to its own voice, so they
 * can't be swapped between cuts. Both voices are in their page's language, so no captions start
 * on; either language can still be turned on from the player.
 */
const FILMS: Record<Locale, string> = {
  en: "/film/noren-intro",
  ja: "/film/noren-intro-ja",
};

/** The intro film. It loads nothing until someone presses play. */
export function FilmPlayer({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}): React.JSX.Element {
  const m = messagesFor(welcomeMessages, locale);
  const film = FILMS[locale];
  return (
    <video
      aria-label={m.filmLabel}
      className={cn("aspect-video w-full rounded-[14px] bg-kon", className)}
      controls
      playsInline
      poster={POSTER}
      preload="none"
    >
      <source src={`${film}.mp4`} type="video/mp4" />
      <track kind="subtitles" label={m.captionsJa} src={`${film}.ja.vtt`} srcLang="ja" />
      <track kind="subtitles" label={m.captionsEn} src={`${film}.en.vtt`} srcLang="en" />
      <a href={`${film}.mp4`}>{m.filmFallback}</a>
    </video>
  );
}
