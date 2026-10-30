"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { swapLocale, type Locale } from "@/lib/i18n";

const languageNames: Record<string, string> = { ja: "日本語", en: "English" };

export function LanguageSwitcherView({
  locale,
  locales,
  pathname,
}: {
  locale: Locale;
  locales: readonly string[];
  pathname: string;
}): React.JSX.Element {
  return (
    <nav
      className="flex shrink-0 whitespace-nowrap rounded-full border border-line p-0.5 text-xs sm:text-sm"
      aria-label="日本語 / English"
    >
      {locales.map((language) => (
        <Link
          key={language}
          href={swapLocale(pathname, language, locales)}
          lang={language}
          hrefLang={language}
          aria-current={language === locale ? "page" : undefined}
          className={
            language === locale
              ? "flex min-h-11 min-w-11 items-center justify-center rounded-full bg-kon px-2 text-white focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2 sm:px-3"
              : "flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-kon hover:bg-kamenozoki focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2 sm:px-3"
          }
        >
          {languageNames[language] ?? language}
        </Link>
      ))}
    </nav>
  );
}

export function LanguageSwitcher(props: {
  locale: Locale;
  locales: readonly string[];
}): React.JSX.Element {
  const pathname = usePathname();
  return <LanguageSwitcherView {...props} pathname={pathname} />;
}
