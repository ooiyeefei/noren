"use client";

import { createContext, useContext } from "react";

const DocumentLinks = createContext(false);

/**
 * Whether the terms and the privacy notice are published. The footer renders inside client pages such
 * as the map, where the region file can't be read, so the layout hands the answer down from the server.
 */
export function DocumentLinksProvider({
  published,
  children,
}: {
  published: boolean;
  children: React.ReactNode;
}) {
  return <DocumentLinks value={published}>{children}</DocumentLinks>;
}

export function useDocumentLinks(): boolean {
  return useContext(DocumentLinks);
}

const FeatureLinks = createContext({ walk: false });

/**
 * Which optional pages are switched on in the region file (features.*), so the footer and the
 * account menu link to a page only while it exists. Off, the page is a 404 and nothing links to it.
 */
export function FeatureLinksProvider({
  walk,
  children,
}: {
  walk: boolean;
  children: React.ReactNode;
}) {
  return <FeatureLinks value={{ walk }}>{children}</FeatureLinks>;
}

export function useFeatureLinks(): { walk: boolean } {
  return useContext(FeatureLinks);
}
