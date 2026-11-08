import type { Metadata } from "next";
import { ProposalView } from "@/components/proposal/proposal-view";
import { isSupportedLocale, messagesFor } from "@/lib/i18n";
import { proposalMessages } from "@/lib/i18n/messages/proposal";
import { getLocale } from "@/lib/i18n/server";

// The mock proposal for local teams (spec 002, R18). Static, reads no data, and nothing links to it.
// The root layout and next.config.ts already mark every page noindex, so nothing is set here.
export async function generateMetadata({
  params,
}: PageProps<"/[lang]/for-local-teams">): Promise<Metadata> {
  const { lang } = await params;
  const m = messagesFor(proposalMessages, isSupportedLocale(lang) ? lang : "en");
  return { title: `${m.metaTitle} | Noren`, description: m.statement };
}

export default async function Page() {
  return <ProposalView locale={await getLocale()} />;
}
