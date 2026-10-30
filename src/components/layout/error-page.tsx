import { messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { ErrorMessage } from "./error-message";
import { PageContainer } from "./page-container";

export function ErrorPage({ error, locale }: { error: unknown; locale: Locale }) {
  const m = messagesFor(shellMessages, locale);
  return (
    <PageContainer locale={locale} title={m.errorTitle}>
      <ErrorMessage error={error} locale={locale} />
    </PageContainer>
  );
}
