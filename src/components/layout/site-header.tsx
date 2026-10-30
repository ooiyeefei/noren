import Link from "next/link";
import { Suspense } from "react";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { AccountMenu } from "./account-menu";
import { LanguageSwitcher, LanguageSwitcherView } from "./language-switcher";
import { NorenMark } from "./noren-mark";

export function SiteHeader({
  locale,
  regionName,
  locales,
}: {
  locale: Locale;
  regionName: string;
  locales: readonly string[];
}): React.JSX.Element {
  const m = messagesFor(shellMessages, locale);
  return (
    <header className="h-14 shrink-0 border-b border-line bg-white text-kon">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-3 focus:shadow-[var(--shadow-float)]"
      >
        {m.skipLink}
      </a>
      <div className="mx-auto flex h-full flex-nowrap max-w-[1200px] items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            className="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap text-lg font-bold sm:gap-2"
            href={localePath(locale)}
          >
            <NorenMark />
            <span className="max-[379px]:sr-only">{m.productName}</span>
          </Link>
          <span className="hidden truncate text-sm text-muted-foreground sm:block">
            {regionName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Suspense
            fallback={
              <LanguageSwitcherView
                locale={locale}
                locales={locales}
                pathname={localePath(locale)}
              />
            }
          >
            <LanguageSwitcher locale={locale} locales={locales} />
          </Suspense>
          <Suspense fallback={null}>
            <AccountMenu locale={locale} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
