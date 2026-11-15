import { expect, it } from "vitest";
import {
  deviceString,
  pageFromQuery,
  reportError,
  submitArguments,
  validateDetails,
} from "@/components/report/report-logic";
import { newestFirst, pageHref } from "@/components/steward/problems-logic";
import { reportMessages } from "@/lib/i18n/messages/report";

const q = (value: string | null) => ({ get: () => value });

it("the from parameter is reduced to a same-site path", () => {
  expect(pageFromQuery(q("/en/places/x?y=1#z"))).toBe("/en/places/x");
  for (const bad of ["https://evil.example/x", "//evil", "javascript:1", "", null])
    expect(pageFromQuery(q(bad))).toBe("");
});

it("the device string is size, a dot and the user agent, cut to 300", () => {
  expect(deviceString(360, 640, "UA")).toBe("360×640 · UA");
  expect(deviceString(360, 640, "x".repeat(500))).toHaveLength(300);
});

it("details need 10 to 2000 characters after trimming", () => {
  expect(validateDetails("  short  ", "en")).toBe(reportMessages.en.length);
  expect(validateDetails("x".repeat(2001), "ja")).toBe(reportMessages.ja.length);
  expect(validateDetails(` ${"x".repeat(10)} `, "en")).toBeNull();
});

it("submit arguments trim and leave out an empty contact", () => {
  const draft = { details: "  something broke  ", contact: "   ", website: "" };
  expect(submitArguments(draft, "/en/map", "dev", "en")).toEqual({
    details: "something broke",
    pagePath: "/en/map",
    device: "dev",
    locale: "en",
    website: "",
  });
  expect(submitArguments({ ...draft, contact: " a@b.c " }, "", "d", "ja").contact).toBe("a@b.c");
});

it("errors map rate_limited and invalid_input to friendly text", () => {
  expect(reportError({ data: { code: "rate_limited" } }, "en")).toBe(reportMessages.en.tryLater);
  expect(reportError({ data: { code: "invalid_input" } }, "ja")).toBe(reportMessages.ja.invalid);
  expect(reportError(new Error("boom"), "en")).not.toBe("");
});

it("the steward list is newest first and links only same-site paths", () => {
  const row = (id: string, receivedAt: number) => ({
    _id: id,
    details: "d",
    pagePath: "",
    device: "",
    locale: "en" as const,
    status: "open" as const,
    receivedAt,
  });
  expect(newestFirst([row("a", 1), row("b", 3), row("c", 2)]).map((r) => r._id)).toEqual([
    "b",
    "c",
    "a",
  ]);
  expect(pageHref("/en/map")).toBe("/en/map");
  expect(pageHref("")).toBe("");
});
