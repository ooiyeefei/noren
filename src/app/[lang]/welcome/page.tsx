import type { Metadata } from "next";
import { WelcomeView } from "@/components/welcome/welcome-view";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { welcomeMessages } from "@/lib/i18n/messages/welcome";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/[lang]/welcome">): Promise<Metadata> {
  const { lang } = await params;
  const m = messagesFor(welcomeMessages, isSupportedLocale(lang) ? lang : "en");
  return { title: `${m.metaTitle} | Noren`, description: m.heroLead };
}

export default async function Page() {
  return <WelcomeView locale={await getLocale()} />;
}
