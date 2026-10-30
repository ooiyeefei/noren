import { errorParts } from "@/components/layout/error-text";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";

export function ErrorMessage({ error, locale }: { error: unknown; locale: Locale }) {
  const { text, detail } = errorParts(error, locale);
  return (
    <div lang={locale} className="min-w-0 max-w-prose break-words">
      <p role="alert">{text}</p>
      {detail && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-ai">
            {messagesFor(shellMessages, locale).technicalDetails}
          </summary>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {detail}
          </p>
        </details>
      )}
    </div>
  );
}
