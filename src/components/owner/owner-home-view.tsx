import { DemoBadge } from "@/components/badges";
import { StepsPanel } from "@/components/layout/steps-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { ownerMessages } from "@/lib/i18n/messages/owner";

export type OwnerHomeItem = {
  id: string;
  href: string;
  name: string;
  lang: string;
  isMock: boolean;
  needsReview: boolean;
  /** Rendered after the name, for example how many statements wait for review. */
  status?: React.ReactNode;
};

export function OwnerLoading({ locale }: { locale: Locale }): React.JSX.Element {
  return (
    <div role="status" className="space-y-3">
      <p>{messagesFor(ownerMessages, locale).loading}</p>
      <ul aria-hidden="true">
        {[0, 1, 2].map((id) => (
          <li key={id} className="py-2">
            <Skeleton className="h-8 w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OwnerHomeView({
  locale,
  items,
}: {
  locale: Locale;
  items: readonly OwnerHomeItem[];
}): React.JSX.Element {
  const m = messagesFor(ownerMessages, locale);
  return (
    <div lang={locale} className="max-w-3xl space-y-6 leading-7 text-kon">
      <StepsPanel
        title={m.stepsTitle}
        steps={[m.stepLink, m.stepRead, m.stepReview]}
        done={items.length > 0}
        lang={locale}
      />
      {items.length === 0 ? (
        <div className="space-y-4">
          <p role="note" className="max-w-prose">
            {m.homeEmpty}
          </p>
          <a
            className="inline-flex min-h-11 items-center text-ai underline underline-offset-4"
            href={localePath(locale, "/notice")}
          >
            {m.noticeLink}
          </a>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-w-0 flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-2 break-words">
                <div className="flex flex-wrap items-center gap-2">
                  <strong lang={item.lang} className="text-lg">
                    {item.name}
                  </strong>
                  {item.isMock && <DemoBadge locale={locale} />}
                </div>
                {item.status}
              </div>
              <a
                href={item.href}
                className={
                  item.needsReview
                    ? "inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] bg-kon px-5 py-3 text-center font-bold text-white"
                    : "inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] border border-input px-5 py-3 text-center font-bold text-kon hover:bg-kamenozoki"
                }
              >
                {item.needsReview ? m.reviewButton : m.seeStatements}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
