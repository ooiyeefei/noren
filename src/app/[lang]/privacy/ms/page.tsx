import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { documentValues } from "@/components/legal/documents";
import { LegalDocumentView } from "@/components/legal/legal-document";
import { malayPrivacy } from "@/lib/i18n/messages/legal-documents";
import { getLocale } from "@/lib/i18n/server";
import { activeRegionConfig, enabledRegionConfigs } from "@/lib/region/registry";

export const metadata: Metadata = {
  title: `${malayPrivacy.document.title} | Noren`,
};

/** The Malay notice is its own document, and answers 404 until the Malaysian region is on (T038). */
export default async function Page() {
  const locale = await getLocale();
  const values = documentValues(
    activeRegionConfig(),
    locale,
    enabledRegionConfigs().map((region) => region.id),
  );
  if (values === null || values.malaysia === "off") notFound();
  return <LegalDocumentView locale={locale} kind="privacy" values={values} malay />;
}
