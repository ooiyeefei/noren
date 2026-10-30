import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { UnreviewedBadge } from "@/components/badges";
import { PageContainer } from "@/components/layout/page-container";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";

export function NoticeView({
  locale,
  platforms,
  contact,
  operatorName,
}: {
  locale: Locale;
  platforms: readonly string[];
  contact: string | null;
  operatorName: string | null;
}) {
  const m = messagesFor(publicMessages, locale);
  const formHref = `/${locale}/takedown`;
  let isFormContact = contact === formHref;
  if (contact) {
    try {
      isFormContact ||= new URL(contact, "https://notice.invalid").pathname.endsWith("/takedown");
    } catch {
      // Non-URL contacts, such as role addresses, remain visible.
    }
  }
  return (
    <PageContainer locale={locale} title={m.noticeTitle}>
      <div lang={locale} className="max-w-prose space-y-4">
        <UnreviewedBadge locale={locale} />
        <p>
          {m.openData}{" "}
          <a className="underline" href="https://www.openstreetmap.org/copyright">
            © OpenStreetMap contributors
          </a>{" "}
          {m.osmLicence}
        </p>
        <p>{m.storyPolicy}</p>
        <p>
          {platforms.length
            ? format(m.platforms, { platforms: platforms.join(locale === "ja" ? "、" : ", ") })
            : m.noPlatforms}
        </p>
        <p>{m.clickToLoad}</p>
        <p>{m.privacy}</p>
        <p>{m.originals}</p>
        <p>
          <a className="underline" href={formHref}>
            {messagesFor(takedownMessages, locale).useForm}
          </a>
          {contact && !isFormContact && <> {format(m.removal, { contact })}</>}
        </p>
        <p>{operatorName ? format(m.operator, { name: operatorName }) : m.operatorPending}</p>
      </div>
    </PageContainer>
  );
}
