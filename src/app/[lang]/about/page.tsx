import type { Metadata } from "next";
import { AboutView } from "@/components/about/about-view";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { aboutMessages } from "@/lib/i18n/messages/about";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/about">): Promise<Metadata> {
  const { lang } = await params;
  const m = messagesFor(aboutMessages, isSupportedLocale(lang) ? lang : "en");
  return { title: `${m.metaTitle} | Noren`, description: m.heroLead };
}

export default async function Page() {
  return <AboutView locale={await getLocale()} />;
}
