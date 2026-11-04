import { takedownMessages } from "@/lib/i18n/messages/takedown";
import { UnreviewedBadge } from "@/components/badges";
import { PageContainer } from "@/components/layout/page-container";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";

const LINK = "underline";

/**
 * What Overture asks us to credit for its Places theme (docs.overturemaps.org/attribution, checked
 * 2026-11-04): each provider's data under its own licence, and for Foursquare the copyright line,
 * a note that the data was transformed and a link to its NOTICE.
 */
function OvertureCredit({ locale }: { locale: Locale }) {
  const m = messagesFor(publicMessages, locale);
  return (
    <div className="space-y-2">
      <p>
        {m.overtureData}{" "}
        <a className={LINK} href="https://docs.overturemaps.org/attribution/">
          Overture Maps Foundation, overturemaps.org
        </a>
      </p>
      <ul className="list-disc space-y-1 pl-6">
        <li>
          <a className={LINK} href="https://about.meta.com/">
            Meta
          </a>
          ,{" "}
          <a className={LINK} href="https://www.microsoft.com/en-us/">
            Microsoft
          </a>
          ,{" "}
          <a className={LINK} href="https://uberall.com/">
            Uberall
          </a>
          ,{" "}
          <a className={LINK} href="https://opentravel.org/">
            OpenTravel Alliance
          </a>
          :{" "}
          <a className={LINK} href="https://cdla.dev/permissive-2-0/">
            CDLA-Permissive-2.0
          </a>
        </li>
        <li>
          <a className={LINK} href="https://foursquare.com/">
            Foursquare
          </a>
          :{" "}
          <a className={LINK} href="https://www.apache.org/licenses/LICENSE-2.0">
            Apache-2.0
          </a>
          . Copyright 2024 Foursquare Labs, Inc. All rights reserved. {m.overtureTransformed}{" "}
          <a className={LINK} href="https://opensource.foursquare.com/places-notice-txt/">
            NOTICE.txt
          </a>
        </li>
        <li>
          <a className={LINK} href="https://alltheplaces.xyz/">
            AllThePlaces
          </a>
          :{" "}
          <a className={LINK} href="https://creativecommons.org/publicdomain/zero/1.0/">
            CC0 1.0
          </a>
        </li>
      </ul>
    </div>
  );
}

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
        <OvertureCredit locale={locale} />
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
