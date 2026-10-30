import type { Locale } from "@/lib/i18n";
import { SiteFooter } from "./site-footer";

export function PageContainer({
  title,
  actions,
  children,
  locale,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  locale?: Locale;
}): React.JSX.Element {
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 px-4 pt-6 pb-8 sm:px-6"
      >
        {(title || actions) && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {title && (
              <h1 className="min-w-0 font-sans text-[28px] font-bold break-words lg:text-4xl">
                {title}
              </h1>
            )}
            {actions && (
              <div className="flex flex-wrap gap-3 sm:ml-auto sm:justify-end">{actions}</div>
            )}
          </div>
        )}
        {children}
      </main>
      {locale && <SiteFooter locale={locale} />}
    </>
  );
}
