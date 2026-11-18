import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PostcardCard } from "@/components/postcard/postcard-card";
import { PageContainer } from "@/components/layout/page-container";
import { placeHeading } from "@/components/public/mapping";
import { format, isSupportedLocale, localePath, messagesFor } from "@/lib/i18n";
import { postcardMessages } from "@/lib/i18n/messages/postcard";
import { getLocale } from "@/lib/i18n/server";
import { publicPhotoProps } from "@/lib/photos/settings";
import { loadPostcard } from "@/lib/postcard/load";
import { getActiveRegion } from "@/lib/region";

// Dark behind features.postcard in the region file: while it is off there is no page, only a 404.
// A card is private: its address is the key, and nothing about it is for a search engine, so the
// header (next.config.ts, PRIVATE_SECTIONS) and this tag both say so. The referrer is withheld from
// anything the card loads from another site, so a photo's server never learns the card's address.

export async function generateMetadata({
  params,
}: PageProps<"/[lang]/postcard/[code]">): Promise<Metadata> {
  const region = getActiveRegion();
  const noindex = { robots: { index: false, follow: false }, referrer: "same-origin" as const };
  if (!region.features.postcard) return noindex;
  const { lang, code } = await params;
  const locale = isSupportedLocale(lang) ? lang : "en";
  const card = await loadPostcard(code);
  if (card === null) return noindex;
  const m = messagesFor(postcardMessages, locale);
  const names = card.places
    .slice(0, 3)
    .map((place) => placeHeading(place.names, locale, region).primary.text);
  const title = `${format(m.cardMetaTitle, { name: card.recipientName })} | Noren`;
  const description = format(m.cardMetaDescription, {
    from: card.fromName,
    places: names.join(locale === "ja" ? "、" : ", ") + (card.places.length > 3 ? "…" : ""),
  });
  const image = `/api/postcard/${encodeURIComponent(code)}/image?lang=${locale}`;
  return {
    ...noindex,
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Noren",
      type: "website",
      locale,
      images: [{ url: image, width: 1200, height: 630, alt: m.cardTitle }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function Page({ params }: PageProps<"/[lang]/postcard/[code]">) {
  // Before anything streams, so the response is a real 404 and not an empty 200.
  if (!getActiveRegion().features.postcard) notFound();
  return (
    <Suspense>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: PageProps<"/[lang]/postcard/[code]">["params"] }) {
  const locale = await getLocale();
  const { code } = await params;
  const card = await loadPostcard(code);
  if (card === null) notFound();
  const region = getActiveRegion();
  const m = messagesFor(postcardMessages, locale);
  return (
    <PageContainer locale={locale}>
      <PostcardCard
        locale={locale}
        card={card}
        region={{
          defaultLocale: region.defaultLocale,
          nameFallback: region.nameFallback,
          town: { en: region.name.en ?? region.id, ja: region.name.ja ?? "" },
          utcOffsetHours: region.collection.utcOffsetHours,
          photoBaseUrl: publicPhotoProps(region, process.env)?.baseUrl,
        }}
      />
      <aside className="mx-auto w-full max-w-[720px] space-y-2 text-[15px] text-muted-foreground">
        <p>{m.cardInvite}</p>
        <a
          href={localePath(locale, "/welcome")}
          className="inline-flex min-h-11 items-center text-ai underline underline-offset-4"
        >
          {m.cardInviteLink}
        </a>
        <p>{m.cardPrivate}</p>
      </aside>
    </PageContainer>
  );
}
