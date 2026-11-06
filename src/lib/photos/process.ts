import sharp from "sharp";
import type { RegionConfig } from "../region/schema";

export type PhotoLimits = Pick<
  RegionConfig["photos"],
  "maxEdgePixels" | "maxInputPixels" | "jpegQuality"
>;
export type PhotoRefusal = "not_an_image" | "not_a_jpeg" | "too_many_pixels";
export type ReencodedPhoto =
  { ok: true; jpeg: Buffer; width: number; height: number } | { ok: false; reason: PhotoRefusal };

/**
 * The only way bytes reach `photos/`: decode the upload and write a new JPEG. Nothing from the file
 * survives except its pixels, which removes metadata, GPS and anything hidden after the picture.
 * The browser already shrank it, but this trusts none of that.
 *
 * It takes JPEG alone because the browser always sends JPEG, and JPEG has no script and no frames, so
 * this refuses SVG and every animation by reading the file's real format.
 */
export async function reencodePhoto(
  input: Uint8Array,
  limits: PhotoLimits,
): Promise<ReencodedPhoto> {
  // `error` stops on a truncated or corrupt file rather than storing part of a picture.
  const open = () =>
    sharp(input, { failOn: "error", limitInputPixels: limits.maxInputPixels, animated: false });
  let width: number;
  let height: number;
  try {
    const metadata = await open().metadata();
    if (metadata.format !== "jpeg") return { ok: false, reason: "not_a_jpeg" };
    width = metadata.width;
    height = metadata.height;
  } catch (error) {
    return { ok: false, reason: refusalFor(error) };
  }
  if (width * height > limits.maxInputPixels) return { ok: false, reason: "too_many_pixels" };
  try {
    const { data, info } = await open()
      // Metadata goes below, so a phone's rotation must move into the pixels first.
      .autoOrient()
      .resize({
        width: limits.maxEdgePixels,
        height: limits.maxEdgePixels,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: limits.jpegQuality })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, jpeg: data, width: info.width, height: info.height };
  } catch (error) {
    return { ok: false, reason: refusalFor(error) };
  }
}

function refusalFor(error: unknown): PhotoRefusal {
  const message = error instanceof Error ? error.message : "";
  return /pixel limit/i.test(message) ? "too_many_pixels" : "not_an_image";
}
