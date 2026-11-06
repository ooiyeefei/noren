/** Runs in the browser. The server re-encodes everything again, so this only saves the upload. */

export class PhotoUnreadable extends Error {
  constructor(message: string) {
    super(message.trim() || "the browser could not read this picture");
    this.name = "PhotoUnreadable";
  }
}

/** The size to draw at: the longest side at most `maxEdge`, never enlarged, each side at least 1. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function failureText(error: unknown): string {
  return error instanceof Error
    ? `${error.name || "Error"}: ${error.message || "no message"}`
    : `NonError: ${typeof error}`;
}

/**
 * Draws the picture onto a canvas and asks for a JPEG. A canvas keeps only pixels, so this drops most
 * metadata, and any format the browser can show comes out as JPEG, which is how iPhone HEIC gets
 * through. Browsers apply a photo's rotation when drawing from an image element.
 */
export async function shrinkPhoto(
  file: Blob,
  { maxEdgePixels, jpegQuality }: { maxEdgePixels: number; jpegQuality: number },
): Promise<Blob> {
  const address = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = address;
    await image.decode();
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, maxEdgePixels);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new PhotoUnreadable("no canvas context");
    context.drawImage(image, 0, 0, width, height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", jpegQuality / 100),
    );
    if (jpeg === null) throw new PhotoUnreadable("the canvas gave no image");
    return jpeg;
  } catch (error) {
    throw error instanceof PhotoUnreadable ? error : new PhotoUnreadable(failureText(error));
  } finally {
    URL.revokeObjectURL(address);
  }
}
