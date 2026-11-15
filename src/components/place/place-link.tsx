import type { ReactNode } from "react";
import { placeHeading, type NameLike, type PublicRegionProps } from "@/components/public/mapping";
import { format, localePath, type Locale } from "@/lib/i18n";

/** What the names of a place need to be shown in the page's language. */
export type NameRegion = Pick<PublicRegionProps, "nameFallback" | "defaultLocale">;

/** A place's name for the page, with its language; without a region the first name stands. */
export function placeNameFor(
  names: readonly NameLike[],
  locale: Locale,
  region: NameRegion | undefined,
): { text: string; lang: string } {
  if (region !== undefined) return placeHeading(names, locale, region).primary;
  return { text: names[0]?.value ?? "", lang: names[0]?.lang ?? locale };
}

/** A link to a place's stories tab, named in the page's language. */
export function PlaceLink({
  locale,
  region,
  place,
}: {
  locale: Locale;
  region: NameRegion | undefined;
  place: { slug: string; names: readonly NameLike[] };
}) {
  const name = placeNameFor(place.names, locale, region);
  return (
    <a
      className="underline"
      href={`${localePath(locale, `/places/${encodeURIComponent(place.slug)}`)}?tab=stories`}
    >
      <span lang={name.lang} className="[overflow-wrap:anywhere]">
        {name.text}
      </span>
    </a>
  );
}

/**
 * A message with a `{place}` in it, where the place is a link and not text. The other values are
 * filled in as usual; the words before and after the place stay as the message has them.
 */
export function withPlace(
  template: string,
  values: Readonly<Record<string, string | number>>,
  place: ReactNode,
): ReactNode {
  const marker = "\u0000";
  const [before = "", after = ""] = format(template, { ...values, place: marker }).split(marker);
  return (
    <>
      {before}
      {place}
      {after}
    </>
  );
}
