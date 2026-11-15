"use client";

import { localePath, type Locale } from "@/lib/i18n";

/**
 * The footer's report link. It adds the page the visitor is on as they reach for the link, so the
 * report can say where. Reading the address at that moment (and not with usePathname) keeps every
 * page that carries the footer prerenderable.
 */
export function ReportLink({ locale, label }: { locale: Locale; label: string }) {
  const base = localePath(locale, "/report");
  const carryPage = (link: HTMLAnchorElement) => {
    link.href = `${base}?from=${encodeURIComponent(window.location.pathname)}`;
  };
  return (
    <a
      className="flex min-h-11 items-center underline underline-offset-4 hover:text-ai"
      href={base}
      onPointerDown={(event) => carryPage(event.currentTarget)}
      onFocus={(event) => carryPage(event.currentTarget)}
      onClick={(event) => carryPage(event.currentTarget)}
    >
      {label}
    </a>
  );
}
