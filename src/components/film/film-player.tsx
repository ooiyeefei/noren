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

/**
 * The same cut on YouTube, one per language. It is only ever a plain link, never an embed, so
 * nothing from YouTube loads or sets a cookie unless someone follows it.
 */
const YOUTUBE: Record<Locale, string> = {
  en: "https://www.youtube.com/watch?v=cs5iDFAb-oI",
  ja: "https://www.youtube.com/watch?v=5qWkDLRznw0",
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
    <div className="space-y-1">
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
      <p>
        <a
          href={YOUTUBE[locale]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-[15px] text-ai underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {m.watchOnYoutube}
          <span className="sr-only"> {m.opensInNewTab}</span>
        </a>
      </p>
    </div>
  );
}
