import { messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";

export function ExploreGuide({ locale, onDismiss }: { locale: Locale; onDismiss?(): void }) {
  const m = messagesFor(publicMessages, locale);
  return (
    <aside
      aria-label={m.guideTitle}
      className="rounded-[14px] border border-line bg-white p-4 text-[13px] leading-relaxed text-kon shadow-[var(--shadow-float)] lg:shadow-none"
    >
      <h2 className="mb-2 text-base font-bold">{m.guideTitle}</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>{m.guide1}</li>
        <li>{m.guide2}</li>
        <li>{m.guide3}</li>
      </ol>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 min-h-11 rounded-[10px] bg-kon px-4 font-bold text-white"
      >
        {m.gotIt}
      </button>
    </aside>
  );
}
