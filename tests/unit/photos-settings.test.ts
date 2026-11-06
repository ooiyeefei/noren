import { describe, expect, it } from "vitest";
import nagasaki from "../../regions/nagasaki.json";
import {
  photoObjectSettings,
  photoStorageSettings,
  photoUploadOrigin,
  photoUrl,
  publicPhotoProps,
} from "@/lib/photos/settings";
import { activeRegionConfig } from "@/lib/region/registry";
import { regionSchema, type RegionConfig } from "@/lib/region/schema";

const env = {
  PHOTOS_S3_BUCKET: "fictional-photo-bucket",
  PHOTOS_S3_REGION: "ap-northeast-1",
  PHOTOS_S3_ACCESS_KEY_ID: "AKIAFICTIONAL",
  PHOTOS_S3_SECRET_ACCESS_KEY: "fictional-secret-value",
  PHOTOS_PUBLIC_BASE_URL: "https://photos.fictional.example/",
};
const region = activeRegionConfig();
const on = { photos: { ...region.photos, enabled: true } };

function parse(change: (region: { photos: Record<string, unknown> }) => void) {
  const copy = structuredClone(nagasaki) as unknown as { photos: Record<string, unknown> };
  change(copy);
  return regionSchema.safeParse(copy);
}

describe("the region's photos block", () => {
  it("ships switched off", () => {
    expect(region.photos.enabled).toBe(false);
  });

  it("holds the numbers the owner decided", () => {
    expect(region.photos.maxPerStory).toBe(4);
    expect(region.photos.maxEdgePixels).toBe(2048);
    expect(region.photos.perDay).toBe(30);
    expect(region.collection.newAccount.perDay.photo).toBe(5);
    expect(region.photos.refusingCaution).toBe("no_photography");
  });

  it("refuses a caution outside the vocabulary", () => {
    expect(parse((r) => (r.photos.refusingCaution = "no_flash")).success).toBe(false);
  });

  it("refuses a pixel limit that a picture at the edge limit could not pass", () => {
    expect(parse((r) => (r.photos.maxInputPixels = 1000)).success).toBe(false);
  });

  it.each([
    ["maxPerStory", 0],
    ["maxPerStory", 1.5],
    ["jpegQuality", 101],
    ["cacheSeconds", -1],
    ["maxUploadBytes", 0],
  ])("refuses %s = %s", (field, value) => {
    expect(parse((r) => (r.photos[field] = value)).success).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(parse((r) => (r.photos.videos = true)).success).toBe(false);
  });
});

describe("storage settings", () => {
  it("reads all five, trimmed, with the base address's trailing slash gone", () => {
    expect(photoStorageSettings({ ...env, PHOTOS_S3_BUCKET: " fictional-photo-bucket\n" })).toEqual(
      {
        bucket: "fictional-photo-bucket",
        region: "ap-northeast-1",
        accessKeyId: "AKIAFICTIONAL",
        secretAccessKey: "fictional-secret-value",
        publicBaseUrl: "https://photos.fictional.example",
      },
    );
  });

  it.each(Object.keys(env))("is off when %s is missing or blank", (name) => {
    expect(photoStorageSettings({ ...env, [name]: undefined })).toBeNull();
    expect(photoStorageSettings({ ...env, [name]: "   " })).toBeNull();
  });

  it.each([
    ["PHOTOS_PUBLIC_BASE_URL", "http://photos.fictional.example"],
    ["PHOTOS_PUBLIC_BASE_URL", "https://user:pw@photos.fictional.example"],
    ["PHOTOS_PUBLIC_BASE_URL", "https://photos.fictional.example/a?b=c"],
    ["PHOTOS_PUBLIC_BASE_URL", "not an address"],
    ["PHOTOS_S3_BUCKET", "Not_A_Bucket"],
    ["PHOTOS_S3_REGION", "tokyo"],
  ])("is off when %s is %s", (name, value) => {
    expect(photoStorageSettings({ ...env, [name]: value })).toBeNull();
  });

  it("Convex needs no public address, because it only deletes", () => {
    expect(photoObjectSettings({ ...env, PHOTOS_PUBLIC_BASE_URL: undefined })).toMatchObject({
      bucket: "fictional-photo-bucket",
    });
  });

  it("names the address the browser uploads to", () => {
    expect(photoUploadOrigin({ bucket: "fictional-photo-bucket", region: "ap-northeast-1" })).toBe(
      "https://fictional-photo-bucket.s3.ap-northeast-1.amazonaws.com",
    );
  });

  it("builds a photo's address from the key", () => {
    expect(photoUrl("https://photos.fictional.example", "photos/abc123.jpg")).toBe(
      "https://photos.fictional.example/photos/abc123.jpg",
    );
  });
});

describe("what the page may know", () => {
  it("is nothing when the region has photos off, even with every setting present", () => {
    expect(publicPhotoProps({ photos: { ...region.photos, enabled: false } }, env)).toBeNull();
  });

  it("is nothing when a setting is missing, even with the region on", () => {
    expect(publicPhotoProps(on, { ...env, PHOTOS_S3_SECRET_ACCESS_KEY: undefined })).toBeNull();
  });

  it("never carries a secret to the browser", () => {
    const props = publicPhotoProps(on, env);
    expect(props).toEqual({
      baseUrl: "https://photos.fictional.example",
      maxPerStory: 4,
      maxEdgePixels: 2048,
      jpegQuality: region.photos.jpegQuality,
    });
    const text = JSON.stringify(props);
    expect(text).not.toContain(env.PHOTOS_S3_SECRET_ACCESS_KEY);
    expect(text).not.toContain(env.PHOTOS_S3_ACCESS_KEY_ID);
    expect(text).not.toContain(env.PHOTOS_S3_BUCKET);
  });

  it("a region without the block stays off", () => {
    expect(publicPhotoProps({} as Partial<Pick<RegionConfig, "photos">>, env)).toBeNull();
  });
});
