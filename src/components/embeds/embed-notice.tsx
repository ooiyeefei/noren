import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";

export function EmbedNotice({ locale }: { locale: Locale }): React.JSX.Element {
  const messages = messagesFor(placeUiMessages, locale);
  return (
    <aside lang={locale} className="rounded-lg border bg-muted p-4 text-sm">
      {messages.notice}{" "}
      <a className="underline underline-offset-4" href={localePath(locale, "/notice")}>
        {messages.noticeLink}
      </a>
    </aside>
  );
}
