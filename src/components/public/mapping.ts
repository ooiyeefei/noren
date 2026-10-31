import { categoryOptions, labelForCategory } from "./category";
import type { EmbedSourceView } from "@/components/embeds/embed-view";
import type { MapMarker } from "@/components/map/map-helpers";
import type { PlaceListItem } from "@/components/places/place-list";
import type { StoryClaimView, StorySentenceView, StoryViewModel } from "@/components/story/types";
import { frameHostsFor, scriptHostsFor } from "@/lib/adapters";
import { DETERMINISTIC_COMPOSER } from "@/lib/claims/compose";
import type { PlaceKind, Visibility } from "@/lib/domain/constants";
import { createOpenFreeMapStyle } from "@/lib/geo";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { pickPlaceName, type PlaceNameLike } from "@/lib/region/names";
import type { RegionConfig } from "@/lib/region/schema";

export type PublicRegionProps = {
  categories?: RegionConfig["categories"];
  regionId: string;
  defaultLocale: string;
  nameFallback: RegionConfig["nameFallback"];
  center: { lat: number; lng: number; zoom: number };
  bounds: [number, number, number, number];
  styleUrl: string;
  attribution: string[];
  scriptOrigins: string[];
  frameOrigins: string[];
  sourceAdapters: RegionConfig["enabledSourceAdapters"];
  locales: RegionConfig["locales"];
  cautionVocabulary: RegionConfig["cautionVocabulary"];
};
export type NameLike = PlaceNameLike;
export type PlaceSummaryLike = {
  _id: string;
  regionId: string;
  slug: string;
  kind: PlaceKind;
  visibility: Visibility;
  isMock: boolean;
  category?: string;
  hasStory?: boolean;
  /** When a person last said it is still there; unset for an open-data listing (FR-030). */
  confirmedAt?: number;
  names: NameLike[];
  pin: { lat: number; lng: number } | null;
};
export type PlaceDetailLike = PlaceSummaryLike & {
  dataSources: { provider: string; ref: string; licence?: string; attribution?: string }[];
  canEdit: boolean;
  canManage: boolean;
  hasOwner: boolean;
  isOwner: boolean;
};
export type PageViewLike = {
  placeId: string;
  version: number;
  composedAt: number;
  generatedBy: string;
  sentences: StorySentenceView[];
  claims: (Omit<StoryClaimView, "id"> & { _id: string })[];
};
export type SourceViewLike = Omit<EmbedSourceView, "id"> & { _id: string };
type NameRegion = Pick<PublicRegionProps, "nameFallback" | "defaultLocale">;

export function publicRegionProps(region: RegionConfig, locale: Locale): PublicRegionProps {
  const style = createOpenFreeMapStyle(region);
  return {
    regionId: region.id,
    categories: region.categories,
    defaultLocale: region.defaultLocale,
    nameFallback: region.nameFallback,
    center: region.defaultCenter,
    bounds: region.bbox,
    styleUrl: style.styleUrl(region, "", locale),
    attribution: [...style.attribution],
    scriptOrigins: scriptHostsFor(region.enabledSourceAdapters),
    frameOrigins: frameHostsFor(region.enabledSourceAdapters),
    sourceAdapters: region.enabledSourceAdapters,
    locales: region.locales,
    cautionVocabulary: region.cautionVocabulary,
  };
}

export function placeHeading(names: readonly NameLike[], locale: Locale, region: NameRegion) {
  const { primary, secondary } = pickPlaceName(names, locale, region);
  return {
    primary: {
      text: primary?.value ?? messagesFor(publicMessages, locale).unnamed,
      lang: primary?.lang ?? locale,
    },
    secondary: secondary ? { text: secondary.value, lang: secondary.lang } : null,
  };
}

export function toHomeModel(
  places: readonly PlaceSummaryLike[],
  locale: Locale,
  region: NameRegion & Pick<PublicRegionProps, "categories">,
) {
  const walkthrough: PlaceListItem[] = [];
  const placesList: PlaceListItem[] = [];
  const markers: MapMarker[] = [];
  const categories = categoryOptions(region, locale);
  for (const place of places) {
    const heading = placeHeading(place.names, locale, region);
    const item: PlaceListItem = {
      id: String(place._id),
      href: localePath(locale, `/places/${encodeURIComponent(place.slug)}`),
      name: heading.primary.text,
      secondaryName: heading.secondary?.text,
      secondaryNameLang: heading.secondary?.lang,
      isMock: place.isMock,
      hasStory: place.hasStory,
      unconfirmed: !place.isMock && place.confirmedAt === undefined,
      names: place.names.map((name) => name.value),
      category: place.category,
      pin: place.pin,
      categoryLabel: place.category ? labelForCategory(region, place.category, locale) : undefined,
      categoryUnreviewed: categories.find((entry) => entry.key === place.category)?.unreviewed,
    };
    (place.isMock ? walkthrough : placesList).push(item);
    if (place.pin)
      markers.push({
        id: item.id,
        ...place.pin,
        label: item.name,
        href: item.href,
        isMock: item.isMock,
        hasStory: item.hasStory,
        categoryLabel: item.categoryLabel,
      });
  }
  return { walkthrough, places: placesList, markers, items: [...walkthrough, ...placesList] };
}

export function toStoryViewModel(
  page: PageViewLike,
  options: {
    locale: Locale;
    placeName: string;
    region: Pick<PublicRegionProps, "cautionVocabulary" | "defaultLocale">;
  },
): StoryViewModel {
  return {
    locale: options.locale,
    placeName: options.placeName,
    version: page.version,
    composedAt: page.composedAt,
    aiComposed: page.generatedBy !== DETERMINISTIC_COMPOSER,
    sentences: page.sentences.map((sentence) => ({
      ...sentence,
      claimIds: sentence.claimIds.map(String),
    })),
    claims: page.claims.map(({ _id, ...claim }) => ({
      ...claim,
      id: String(_id),
      disputedWith: claim.disputedWith === undefined ? undefined : String(claim.disputedWith),
    })),
    cautionLabels: Object.fromEntries(
      options.region.cautionVocabulary.map((entry) => [
        entry.key,
        {
          label:
            entry.labels[options.locale] ?? entry.labels[options.region.defaultLocale] ?? entry.key,
          reviewed: entry.labelsReviewedBy !== null,
        },
      ]),
    ),
  };
}

export function toEmbedSource(source: SourceViewLike): EmbedSourceView {
  return {
    id: String(source._id),
    platform: source.platform,
    canonicalUrl: source.canonicalUrl,
    embed: source.embed,
    title: source.title,
    authorHandle: source.authorHandle,
    authorUrl: source.authorUrl,
    postedAt: source.postedAt,
    creatorNote: source.creatorNote,
    noteLang: source.noteLang,
    isMock: source.isMock,
  };
}

export function noticePlatforms(
  region: Pick<RegionConfig, "enabledSourceAdapters">,
  locale: Locale,
): string[] {
  const messages = messagesFor(publicMessages, locale);
  return region.enabledSourceAdapters.filter((id) => id !== "link_card").map((id) => messages[id]);
}
