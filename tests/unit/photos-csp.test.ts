import { describe, expect, it } from "vitest";
import { activeRegionConfig } from "../../src/lib/region/registry";
import { cspHeaderFromEnv } from "../../src/lib/security/csp";

const region = activeRegionConfig();
const on = { ...region, photos: { ...region.photos, enabled: true } };
const off = { ...region, photos: { ...region.photos, enabled: false } };
const SERVED = "https://photos.fictional.example";
const UPLOADS = "https://fictional-photo-bucket.s3.ap-northeast-1.amazonaws.com";
const env = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_" + btoa("example.clerk.accounts.dev$"),
  NEXT_PUBLIC_CONVEX_URL: "https://example.ap-southeast-2.convex.cloud",
  NODE_ENV: "production",
};
const storage = {
  PHOTOS_S3_BUCKET: "fictional-photo-bucket",
  PHOTOS_S3_REGION: "ap-northeast-1",
  PHOTOS_S3_ACCESS_KEY_ID: "AKIAFICTIONAL",
  PHOTOS_S3_SECRET_ACCESS_KEY: "fictional-secret-value",
  PHOTOS_PUBLIC_BASE_URL: `${SERVED}/`,
};

function directive(value: string, name: string) {
  return value.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

describe("the content security policy and photos", () => {
  it("names nothing new while photos are off, with or without settings", () => {
    const plain = cspHeaderFromEnv(env, { enforce: false, region: off }).value;
    expect(plain).not.toContain("amazonaws");
    expect(plain).not.toContain("photos.fictional");
    expect(cspHeaderFromEnv({ ...env, ...storage }, { enforce: false, region: off }).value).toBe(
      plain,
    );
    expect(cspHeaderFromEnv(env, { enforce: false, region: on }).value).toBe(plain);
  });

  it("the policy that ships today names the photo storage, because photos are on", () => {
    expect(cspHeaderFromEnv({ ...env, ...storage }, { enforce: false, region }).value).toBe(
      cspHeaderFromEnv({ ...env, ...storage }, { enforce: false, region: on }).value,
    );
  });

  it("while on, lets images come from the CDN and uploads go to the one bucket, and no further", () => {
    const { value } = cspHeaderFromEnv({ ...env, ...storage }, { enforce: true, region: on });
    expect(directive(value, "img-src")).toContain(SERVED);
    expect(directive(value, "img-src")).not.toContain(UPLOADS);
    expect(directive(value, "connect-src")).toContain(UPLOADS);
    expect(directive(value, "connect-src")).not.toContain(SERVED);
    expect(directive(value, "form-action")).toBe("form-action 'self'");
    expect(directive(value, "script-src")).not.toContain("amazonaws");
  });

  it("never carries a credential", () => {
    const { value } = cspHeaderFromEnv({ ...env, ...storage }, { enforce: true, region: on });
    expect(value).not.toContain(storage.PHOTOS_S3_SECRET_ACCESS_KEY);
    expect(value).not.toContain(storage.PHOTOS_S3_ACCESS_KEY_ID);
  });
});
