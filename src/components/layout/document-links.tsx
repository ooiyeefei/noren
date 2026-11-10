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

// The switched pages' links live in ./features; re-exported for older imports.
export { FeatureLinksProvider, useFeatureLinks } from "./features";
