import { messagesFor, type Locale } from "@/lib/i18n";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";
import { cn } from "@/lib/utils";

const FILM = "/film/noren-intro.mp4";
const POSTER = "/film/noren-intro.jpg";

/**
 * The intro film. It loads nothing until someone presses play. Its voice is English, so a Japanese
 * page starts with Japanese captions on.
 */
export function FilmPlayer({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}): React.JSX.Element {
  const m = messagesFor(welcomeMessages, locale);
  return (
    <video
      aria-label={m.filmLabel}
      className={cn("aspect-video w-full rounded-[14px] bg-kon", className)}
      controls
      playsInline
      poster={POSTER}
      preload="none"
    >
      <source src={FILM} type="video/mp4" />
      <track
        default={locale === "ja"}
        kind="subtitles"
        label={m.captionsJa}
        src="/film/noren-intro.ja.vtt"
        srcLang="ja"
      />
      <track kind="subtitles" label={m.captionsEn} src="/film/noren-intro.en.vtt" srcLang="en" />
      <a href={FILM}>{m.filmFallback}</a>
    </video>
  );
}
