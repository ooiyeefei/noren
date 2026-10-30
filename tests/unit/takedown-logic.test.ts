import { expect, it } from "vitest";
import {
  pageFromQuery,
  removalHref,
  statuses,
  submitArguments,
  validateForm,
  validateText,
} from "@/components/takedown/takedown-logic";
import { takedownMessages } from "@/lib/i18n/messages/takedown";
const draft = {
  pageUrl: "/en/places/mock",
  details: "Mock removal request",
  privacyOrMinor: false,
  contact: "",
  website: "",
};
it("the form refuses details under 10 or over 2000 characters with a readable reason", () => {
  for (const locale of ["ja", "en"] as const) {
    for (const length of [0, 9, 2001])
      expect(validateText("a".repeat(length), locale)).toBe(takedownMessages[locale].length);
    for (const length of [10, 2000]) expect(validateText("a".repeat(length), locale)).toBeNull();
    expect(validateForm({ ...draft, pageUrl: " " }, locale)).toBe(
      takedownMessages[locale].pageRequired,
    );
  }
});
it("the page parameter is read from the query and cleaned", () => {
  expect(pageFromQuery(new URLSearchParams({ page: " \n/en/places/mock\u0000 " }))).toBe(
    "/en/places/mock",
  );
  expect(pageFromQuery(new URLSearchParams())).toBe("");
  expect(removalHref("en", "mock café")).toBe(
    "/en/takedown?page=%2Fen%2Fplaces%2Fmock%2520caf%25C3%25A9",
  );
});
it("the honeypot value is sent as typed and an empty one is sent empty", () => {
  for (const website of ["", "  typed bot value  "])
    expect(submitArguments({ ...draft, website }, "ja")).toEqual({
      pageUrl: draft.pageUrl,
      details: draft.details,
      privacyOrMinor: false,
      locale: "ja",
      website,
    });
});
it("status wording exists for every status in both languages", () => {
  for (const locale of ["ja", "en"] as const)
    for (const status of statuses)
      expect(takedownMessages[locale][status].length).toBeGreaterThan(0);
});
