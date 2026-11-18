import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

// A key in Clerk's public format that decodes to a fake host; not a real credential.
const FAKE_CLERK_KEY = "pk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA==";
const FAKE_CONVEX_URL = "https://example-deployment.convex.cloud";

async function headersForEverything() {
  const rules = (await nextConfig.headers?.()) ?? [];
  return rules.find((rule) => rule.source === "/:path*")?.headers ?? [];
}

describe("next.config", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", FAKE_CLERK_KEY);
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", FAKE_CONVEX_URL);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("with search open, marks the signed-in sections noindex and leaves public pages alone", async () => {
    const noindex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(await headersForEverything()).not.toContainEqual(noindex);
    expect(rules.find((rule) => rule.source === "/:lang/steward/:path*")?.headers).toEqual([
      noindex,
    ]);
    expect(rules.find((rule) => rule.source === "/api/:path*")?.headers).toEqual([noindex]);
    expect(rules.some((rule) => rule.source.includes("places"))).toBe(false);
  });

  it("sends a report-only content security policy naming the services the app uses (T121)", async () => {
    const headers = await headersForEverything();
    const policy = headers.find((h) => h.key === "Content-Security-Policy-Report-Only");
    expect(policy?.value).toContain("script-src");
    expect(policy?.value).toContain("https://clerk.example.test");
    expect(policy?.value).toContain(FAKE_CONVEX_URL);
    expect(policy?.value).toContain("frame-ancestors");
  });

  it("does not enforce the policy yet: it is switched on after a clean walkthrough", async () => {
    const headers = await headersForEverything();
    expect(headers.some((h) => h.key === "Content-Security-Policy")).toBe(false);
  });

  it("refuses to build headers without a valid Clerk key, so a broken policy cannot ship quietly", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    await expect(nextConfig.headers?.()).rejects.toThrow(/Clerk/i);
  });
});
