import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { reencodePhoto } from "@/lib/photos/process";

const limits = { maxEdgePixels: 2048, maxInputPixels: 24_000_000, jpegQuality: 82 };

function solid(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  });
}

/** A JPEG carrying every kind of metadata a phone or an editor might leave in it. */
async function jpegFullOfMetadata() {
  return await solid(120, 80)
    .withExif({
      IFD0: { Make: "FictionalCam", Model: "Fictional 1" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "32/1 45/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "129/1 52/1 0/1",
      },
    })
    .withIccProfile("p3")
    .jpeg()
    .toBuffer();
}

describe("re-encoding a photo", () => {
  it("the fixture really does carry the metadata", async () => {
    const before = await sharp(await jpegFullOfMetadata()).metadata();
    expect(before.exif).toBeDefined();
    expect(before.icc).toBeDefined();
    expect((await jpegFullOfMetadata()).includes("FictionalCam")).toBe(true);
  });

  it("removes all metadata including GPS", async () => {
    const result = await reencodePhoto(await jpegFullOfMetadata(), limits);
    if (!result.ok) throw new Error(result.reason);
    const after = await sharp(result.jpeg).metadata();
    expect(after.format).toBe("jpeg");
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    for (const trace of ["FictionalCam", "Exif", "GPS", "ICC_PROFILE"]) {
      expect(result.jpeg.includes(trace), trace).toBe(false);
    }
  });

  it("drops anything hidden after the picture", async () => {
    const jpeg = await solid(40, 40).jpeg().toBuffer();
    const hidden = Buffer.concat([jpeg, Buffer.from("<script>fictional hidden payload</script>")]);
    const result = await reencodePhoto(hidden, limits);
    if (!result.ok) throw new Error(result.reason);
    expect(result.jpeg.includes("fictional hidden payload")).toBe(false);
  });

  it("applies a phone's rotation to the pixels before the tag goes", async () => {
    const sideways = await solid(120, 80).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    expect((await sharp(sideways).metadata()).orientation).toBe(6);
    const result = await reencodePhoto(sideways, limits);
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([80, 120]);
    const after = await sharp(result.jpeg).metadata();
    expect([after.width, after.height]).toEqual([80, 120]);
  });

  it("shrinks a picture larger than the edge limit, whatever the browser did", async () => {
    const big = await solid(3000, 1500).jpeg().toBuffer();
    const result = await reencodePhoto(big, limits);
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([2048, 1024]);
  });

  it("never enlarges a small picture", async () => {
    const result = await reencodePhoto(await solid(100, 50).jpeg().toBuffer(), limits);
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([100, 50]);
  });

  it("refuses a picture past the pixel limit", async () => {
    const big = await solid(400, 400).jpeg().toBuffer();
    expect(await reencodePhoto(big, { ...limits, maxInputPixels: 1000 })).toEqual({
      ok: false,
      reason: "too_many_pixels",
    });
  });

  it("refuses an SVG, whatever it is called", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    expect(await reencodePhoto(svg, limits)).toEqual({ ok: false, reason: "not_a_jpeg" });
  });

  it("refuses an animated GIF", async () => {
    const gif = await sharp(await solid(10, 10).png().toBuffer())
      .gif()
      .toBuffer();
    expect(await reencodePhoto(gif, limits)).toEqual({ ok: false, reason: "not_a_jpeg" });
  });

  it("refuses an animated WebP", async () => {
    const frames = await sharp(await solid(10, 20).png().toBuffer())
      .webp()
      .toBuffer();
    expect(await reencodePhoto(frames, limits)).toEqual({ ok: false, reason: "not_a_jpeg" });
  });

  it("refuses a PNG, since the browser always sends a JPEG", async () => {
    const png = await solid(10, 10).png().toBuffer();
    expect(await reencodePhoto(png, limits)).toEqual({ ok: false, reason: "not_a_jpeg" });
  });

  it("refuses bytes that are no image at all", async () => {
    expect(await reencodePhoto(Buffer.from("fictional text, not a picture"), limits)).toEqual({
      ok: false,
      reason: "not_an_image",
    });
    expect(await reencodePhoto(Buffer.alloc(0), limits)).toEqual({
      ok: false,
      reason: "not_an_image",
    });
  });

  it("refuses a JPEG cut short, rather than storing half a picture", async () => {
    const jpeg = await solid(400, 400).jpeg().toBuffer();
    const result = await reencodePhoto(jpeg.subarray(0, Math.floor(jpeg.length / 2)), limits);
    expect(result).toEqual({ ok: false, reason: "not_an_image" });
  });
});
