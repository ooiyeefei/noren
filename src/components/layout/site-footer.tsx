import Link from "next/link";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";

export function SiteFooter({
  locale,
  compact = false,
}: {
  locale: Locale;
  compact?: boolean;
}): React.JSX.Element {
  const m = messagesFor(shellMessages, locale);
  return (
    <footer
      lang={locale}
      data-compact={compact ? "true" : undefined}
      className={
        compact
          ? "border-t border-line text-[15px] text-muted-foreground"
          : "mt-8 border-t border-line text-[15px] text-muted-foreground"
      }
    >
      <div
        className={
          compact
            ? "flex flex-col gap-1 px-4 py-3"
            : "mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-6 sm:px-6"
        }
      >
        <div
          className={
            compact ? "flex flex-col" : "flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6"
          }
        >
          <Link
            className="flex min-h-11 items-center underline underline-offset-4 hover:text-ai"
            href={localePath(locale, "/about")}
          >
            {m.whatIsNoren}
          </Link>
          <Link
            className="flex min-h-11 items-center underline underline-offset-4 hover:text-ai"
            href={localePath(locale, "/notice")}
          >
            {m.aboutData}
          </Link>
          <Link
            className="flex min-h-11 items-center underline underline-offset-4 hover:text-ai"
            href={localePath(locale, "/takedown")}
          >
            {m.askRemoval}
          </Link>
          <a
            className="flex min-h-11 items-center underline underline-offset-4 hover:text-ai"
            href="https://www.openstreetmap.org/copyright"
          >
            {m.mapCredit}
          </a>
        </div>
        <p>{m.japaneseReview}</p>
      </div>
    </footer>
  );
}
