import type { SourceAdapterId } from "../domain/constants";
import type { EmbedDescriptor, SourceAdapter } from "../ports";
import { googleMapsLinkAdapter } from "./google-maps-link";
import { linkCardAdapter } from "./link-card";
import { metaEmbedAdapter } from "./meta-embed";
import { tiktokAdapter } from "./tiktok";
import { parseHttpUrl } from "./url";
import { xAdapter } from "./x";
import { youtubeAdapter } from "./youtube";

export type AdapterAuthor = { handle: string; url: string };
export type RegisteredAdapter = SourceAdapter & {
  id: SourceAdapterId;
  /** Origins our UI may frame after a visitor's click. */
  frameHosts: readonly string[];
  /** Unverified author suggestion derived from the URL, without fetching. */
  author(canonicalUrl: string): AdapterAuthor | null;
};

export const ADAPTERS: Readonly<Record<SourceAdapterId, RegisteredAdapter>> = Object.freeze({
  link_card: linkCardAdapter,
  meta_embed: metaEmbedAdapter,
  youtube: youtubeAdapter,
  x: xAdapter,
  google_maps_link: googleMapsLinkAdapter,
  tiktok: tiktokAdapter,
});

export function enabledAdapters(
  ids: readonly SourceAdapterId[],
  registry: Readonly<Record<SourceAdapterId, RegisteredAdapter>> = ADAPTERS,
): RegisteredAdapter[] {
  const adapters = ids.map((id) => {
    const adapter = registry[id];
    if (adapter.policy.storesContent !== false || adapter.policy.aiAllowed !== false) {
      throw new Error(`Unsafe source adapter: ${id}`);
    }
    return adapter;
  });
  return [
    ...adapters.filter((adapter) => adapter.id !== "link_card"),
    ...adapters.filter((adapter) => adapter.id === "link_card"),
  ];
}

export type DescribedSource = {
  adapter: SourceAdapterId;
  platform: string;
  canonicalUrl: string;
  embed: EmbedDescriptor;
  author: AdapterAuthor | null;
};
export type DescribeRefusal = "invalid_url" | "unsupported_scheme" | "too_long" | "no_adapter";

export function describeSource(
  url: string,
  enabledIds: readonly SourceAdapterId[],
): { ok: true; source: DescribedSource } | { ok: false; reason: DescribeRefusal } {
  const parsed = parseHttpUrl(url);
  if (!parsed.ok) return parsed;
  for (const adapter of enabledAdapters(enabledIds)) {
    if (!adapter.matches(parsed.url.href)) continue;
    const description = adapter.describe(parsed.url.href);
    return {
      ok: true,
      source: {
        adapter: adapter.id,
        ...description,
        author: adapter.author(description.canonicalUrl),
      },
    };
  }
  return { ok: false, reason: "no_adapter" };
}

/** Descriptors are rebuilt from stored canonical URLs, never stored themselves. */
export function embedFor(adapterId: SourceAdapterId, canonicalUrl: string): EmbedDescriptor {
  enabledAdapters([adapterId]);
  return ADAPTERS[adapterId].describe(canonicalUrl).embed;
}

export function scriptHostsFor(ids: readonly SourceAdapterId[]): string[] {
  return [...new Set(enabledAdapters(ids).flatMap((adapter) => adapter.policy.scriptHosts))].sort();
}

export function frameHostsFor(ids: readonly SourceAdapterId[]): string[] {
  return [...new Set(enabledAdapters(ids).flatMap((adapter) => adapter.frameHosts))].sort();
}
