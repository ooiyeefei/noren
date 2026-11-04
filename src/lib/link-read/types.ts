import type { SourceAdapterId } from "../domain/constants";

/** What Noren could read of a pasted link. It only fills in the form: none of it is stored as read. */
export type LinkRead = {
  /** read: Noren has words. embed_only: the platform gives an embed and no words. unread: it failed. */
  outcome: "read" | "embed_only" | "unread";
  /** A plain page's title, for the form's title field. */
  title?: string;
  /** A post's caption, a video's title or a page's description. */
  caption?: string;
  author?: string;
  authorUrl?: string;
  /** A plain page's own name for its site. */
  siteName?: string;
  /** Why it failed: an error's name and any HTTP status, never a post's words. */
  failure?: string;
};

export type NoteDraft = { note: string | null; failure?: string };

/**
 * Noren fetches nothing for these. Instagram, Facebook and Threads have no app token here and their
 * terms forbid reading a post through their embed, and a Maps review is only ever linked.
 */
export const EMBED_ONLY_ADAPTERS: readonly SourceAdapterId[] = ["meta_embed", "google_maps_link"];
