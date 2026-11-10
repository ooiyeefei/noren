import { noticePlatforms } from "@/components/public/mapping";
import { frameHostsFor } from "@/lib/adapters";
import type { Locale } from "@/lib/i18n";
import type { NoticeSwitch } from "@/lib/i18n/messages/legal-documents";
import type { RegionConfig } from "@/lib/region/schema";

/**
 * The notice states what the code uses that day (FR-126), so a section or line about photos or a
 * switched feature appears only while it is on.
 */
export type DocumentValues = Readonly<Record<string, string>> & {
  version: string;
  contact: string;
} & Readonly<Record<NoticeSwitch, "on" | "off">>;

const onOff = (value: boolean) => (value ? "on" : "off");

/** The platforms whose posts load inside a page. A Google Maps link is only ever a link. */
function embedPlatforms(region: RegionConfig, locale: Locale): string[] {
  const embedded = region.enabledSourceAdapters.filter((id) => frameHostsFor([id]).length > 0);
  return noticePlatforms({ enabledSourceAdapters: embedded }, locale);
}

/**
 * What the terms and the privacy notice state from the region file, or null until they are published.
 * Without an operator or a contact there is nothing honest to show, so the pages stay closed then too.
 */
export function documentValues(region: RegionConfig, locale: Locale): DocumentValues | null {
  const { documentsVersion, operatorName } = region.legal;
  const { contact, acknowledgeHours, decideDays } = region.takedown;
  if (documentsVersion === null || operatorName === null || contact === null) return null;
  return {
    version: documentsVersion,
    contact,
    photos: onOff(region.photos.enabled),
    connector: onOff(region.features.connector),
    planner: onOff(region.features.planner),
    walk: onOff(region.features.walk),
    // The writer's "Let AI read this story" tick shows while either feature that reads it is on.
    aiReading: onOff(region.features.connector || region.features.planner),
    operator: operatorName,
    region: region.name[locale] ?? region.id,
    minimumAge: String(region.minimumAge),
    acknowledgeHours: String(acknowledgeHours),
    decideDays: String(decideDays),
    newAccountDays: String(region.collection.newAccount.days),
    platforms: embedPlatforms(region, locale).join(locale === "ja" ? "、" : ", "),
  };
}

/** The pages answer 404 and the footer has no links to them until this is true. */
export function documentsPublished(region: RegionConfig): boolean {
  return documentValues(region, "en") !== null;
}
