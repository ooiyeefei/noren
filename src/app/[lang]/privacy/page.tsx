import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { documentValues } from "@/components/legal/documents";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { isSupportedLocale } from "@/lib/i18n";
import { legalDocuments } from "@/lib/i18n/messages/legal-documents";
import { getLocale } from "@/lib/i18n/server";
import { activeRegionConfig } from "@/lib/region/registry";

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/privacy">): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `${legalDocuments[isSupportedLocale(lang) ? lang : "en"].privacy.title} | Noren`,
  };
}

export default async function Page() {
  const locale = await getLocale();
  const values = documentValues(activeRegionConfig(), locale);
  if (values === null) notFound();
  return <LegalDocumentView locale={locale} kind="privacy" values={values} />;
}
