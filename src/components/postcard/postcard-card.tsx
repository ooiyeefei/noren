import { placeHeading, type NameLike } from "@/components/public/mapping";
import { StampInk, StampSeal, stampName, type StampRegion } from "@/components/stamps/stamp";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { postcardMessages } from "@/lib/i18n/messages/postcard";
import { photoUrl } from "@/lib/photos/settings";
import { cardDate } from "@/lib/postcard/rules";
import { cn } from "@/lib/utils";

export type CardPlace = {
  slug: string;
  names: readonly NameLike[];
  excerpt?: { text: string; lang: string };
  photos: readonly { key: string; width: number; height: number }[];
};

export type CardData = {
  recipientName: string;
  message: string;
  messageLang: string;
  aiAssisted: boolean;
  fromName: string;
  sentAt: number;
  places: readonly CardPlace[];
};

export type CardRegion = StampRegion & {
  /** The town in each language, English first on the card. */
  town: { en: string; ja: string };
  utcOffsetHours: number;
  /** Where photos are served from; without it a card shows no photos (the member's preview). */
  photoBaseUrl?: string;
};

const PHOTO_LAYOUT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2",
  4: "grid-cols-2",
};

/**
 * The card as the person with the link reads it, and as the sender previews it. The front is composed
 * from what the member made: their own photos, the stamps of the places, the town and the day. Nothing
 * here is drawn by a model. It is a server component, so the page reads without scripts.
 */
export function PostcardCard({
  locale,
  card,
  region,
  preview = false,
}: {
  locale: Locale;
  card: CardData;
  region: CardRegion;
  /** The sender's own preview: no links out, because nothing is sent yet. */
  preview?: boolean;
}) {
  const m = messagesFor(postcardMessages, locale);
  const photos = region.photoBaseUrl
    ? card.places.flatMap((place) => place.photos.slice(0, 1).map((photo) => ({ ...photo, place })))
    : [];
  const shown = photos.slice(0, 4);
  return (
    <article
      lang={locale}
      data-postcard=""
      className="mx-auto w-full max-w-[720px] overflow-hidden rounded-[14px] border border-line bg-[#f7f4ec] text-kon shadow-float"
    >
      <StampInk />
      <div aria-hidden="true" className="h-3 bg-kasutera" />
      {/* The front. */}
      <section aria-labelledby="postcard-front" className="space-y-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="postcard-front" className="font-bold">
            {m.cardTitle}
          </h2>
          <p className="text-[15px] text-muted-foreground">
            <span lang="en">{region.town.en}</span> <span lang="ja">{region.town.ja}</span>
            {" · "}
            <time dateTime={new Date(card.sentAt).toISOString()}>
              {cardDate(card.sentAt, region.utcOffsetHours, locale)}
            </time>
          </p>
        </header>
        {shown.length > 0 && (
          <ul
            className={cn("grid gap-2", PHOTO_LAYOUT[shown.length])}
            data-postcard-photos={shown.length}
          >
            {shown.map(({ key, width, height, place }, index) => {
              const heading = placeHeading(place.names, locale, region);
              return (
                <li
                  key={key}
                  className={cn(
                    "overflow-hidden rounded-[10px] bg-kamenozoki",
                    shown.length === 3 && index === 0 && "col-span-2",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl(region.photoBaseUrl!, key)}
                    alt={format(m.cardPhotoAlt, { name: heading.primary.text })}
                    width={width}
                    height={height}
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    className={cn(
                      "block w-full object-cover",
                      shown.length === 1 ? "max-h-[420px]" : "aspect-[4/3]",
                    )}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {/* The stamps of the places: the front itself when there is no photo. */}
        <ul
          aria-hidden="true"
          data-postcard-stamps=""
          className="flex flex-wrap items-end justify-center gap-x-2 gap-y-4 py-2"
        >
          {card.places.map((place) => (
            <li key={place.slug}>
              <StampSeal
                name={stampName(place.names, locale, region)}
                seed={place.slug}
                size="small"
              />
            </li>
          ))}
        </ul>
      </section>
      <hr className="border-dashed border-line" />
      {/* The back. */}
      <section aria-labelledby="postcard-back" className="space-y-5 p-4 sm:p-6">
        <h2 id="postcard-back" className="text-[20px] font-bold [overflow-wrap:anywhere]">
          {format(m.cardFor, { name: card.recipientName })}
        </h2>
        <p
          lang={card.messageLang}
          data-postcard-message=""
          className="text-[18px] leading-[1.8] whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {card.message}
        </p>
        <p className="text-right font-bold [overflow-wrap:anywhere]">
          {format(m.cardFrom, { name: card.fromName })}
        </p>
        {card.aiAssisted && (
          <p data-postcard-ai="" className="text-[14px] text-muted-foreground">
            {format(m.aiLabel, { name: card.fromName })}
          </p>
        )}
        {card.places.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[15px] font-bold text-muted-foreground">{m.cardPlaces}</h3>
            <ul className="space-y-3">
              {card.places.map((place) => {
                const heading = placeHeading(place.names, locale, region);
                const name = (
                  <>
                    <span lang={heading.primary.lang} className="font-bold">
                      {heading.primary.text}
                    </span>
                    {heading.secondary && (
                      <span lang={heading.secondary.lang} className="ml-2 text-[15px]">
                        {heading.secondary.text}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={place.slug} className="space-y-1">
                    {preview ? (
                      <span className="inline-flex min-h-11 items-center">{name}</span>
                    ) : (
                      <a
                        href={localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}
                        aria-label={format(m.cardOpenPlace, { name: heading.primary.text })}
                        className="inline-flex min-h-11 items-center text-ai underline underline-offset-4"
                      >
                        {name}
                      </a>
                    )}
                    {place.excerpt && (
                      <blockquote
                        lang={place.excerpt.lang}
                        className="border-l-[3px] border-kasutera pl-3 text-[15px] [overflow-wrap:anywhere]"
                      >
                        {place.excerpt.text}
                      </blockquote>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </article>
  );
}
