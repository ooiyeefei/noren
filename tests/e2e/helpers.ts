import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

export const browserLikeHeaders = {
  "Sec-Fetch-Dest": "document",
  Accept: "text/html",
};

export const publicPages = [
  "/ja/map",
  "/en/map",
  "/ja/notice",
  "/en/notice",
  "/ja/takedown",
  "/en/takedown",
  "/en/takedown/status",
  "/en/sign-in",
] as const;

// Spec 002's pages, signed out. The documents and sign-up answer 404 while switched off, so they
// follow regions/nagasaki.json, and the same run holds before and after they open. The collection
// pages show "no noren here" on a site where the set is not live, and are still worth a look.
const { legal } = JSON.parse(readFileSync("regions/nagasaki.json", "utf8")) as {
  legal: { documentsVersion: string | null; accountsOpen: boolean };
};
export const collectionPages = [
  "/ja/collection",
  "/en/collection",
  "/en/collection/shinchi",
  "/ja/collection/shinchi",
] as const;
export const proposalPages = ["/ja/for-local-teams", "/en/for-local-teams"] as const;
export const documentPages = (
  legal.documentsVersion !== null ? ["/ja/terms", "/en/terms", "/ja/privacy", "/en/privacy"] : []
) as readonly string[];
export const signUpPages = (
  legal.accountsOpen ? ["/ja/sign-up", "/en/sign-up"] : []
) as readonly string[];
// The newest public pages, all signed out: the first page a visitor meets and the page about Noren.
export const introPages = ["/ja/welcome", "/en/welcome", "/ja/about", "/en/about"] as const;

export function visibleText(page: Page) {
  return page.locator("body").innerText();
}
