import { describe, expect, it } from "vitest";
import robots from "../../src/app/robots";

describe("robots.txt", () => {
  it("disallows every crawler from every path and allows nothing (FR-021)", () => {
    const { rules } = robots();
    expect(rules).toEqual({ userAgent: "*", disallow: "/" });
  });
});
