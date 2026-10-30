import type { Page } from "@playwright/test";

export const browserLikeHeaders = {
  "Sec-Fetch-Dest": "document",
  Accept: "text/html",
};

export const publicPages = [
  "/ja",
  "/en",
  "/ja/notice",
  "/en/notice",
  "/ja/takedown",
  "/en/takedown",
  "/en/takedown/status",
  "/en/sign-in",
] as const;

export function visibleText(page: Page) {
  return page.locator("body").innerText();
}
