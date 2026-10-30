import Link from "next/link";
import { lang } from "next/root-params";
import { PageContainer } from "@/components/layout/page-container";
import { isSupportedLocale, localePath, messagesFor } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { getActiveRegion } from "@/lib/region";

export default async function NotFound(): Promise<React.JSX.Element> {
  const language = await lang();
  const fallback = getActiveRegion().defaultLocale;
  if (!isSupportedLocale(fallback)) throw new Error("Unsupported region default locale");
  const locale = isSupportedLocale(language) ? language : fallback;
  const m = messagesFor(shellMessages, locale);
  return (
    <PageContainer locale={locale} title={m.notFoundTitle}>
      <p>{m.notFoundBody}</p>
      <Link className="underline" href={localePath(locale)}>
        {m.backToStart}
      </Link>
    </PageContainer>
  );
}
