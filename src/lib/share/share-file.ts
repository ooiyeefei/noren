export type ShareOutcome = "shared" | "downloaded" | "cancelled";

type ShareNavigator = Pick<Navigator, "canShare" | "share">;

function errorName(caught: unknown): string {
  return caught instanceof Error ? caught.name || "Error" : typeof caught;
}

/** Saves the picture through a link click, the one way every browser takes. */
export function downloadBlob(blob: Blob, fileName: string, doc: Document = document): void {
  const href = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = href;
  link.download = fileName;
  doc.body.append(link);
  link.click();
  link.remove();
  // Let the browser start the save before the address is let go.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export async function fetchPicture(
  url: string,
  fileName: string,
  fetcher: typeof fetch = fetch,
): Promise<File> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`picture request failed (${response.status})`);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/png" });
}

/** Whether this browser can hand the picture itself to the share sheet. */
export function canShareFile(file: File, nav: Partial<ShareNavigator> | undefined): boolean {
  return typeof nav?.share === "function" && !!nav.canShare?.({ files: [file] });
}

/**
 * On a phone the share sheet takes the file, so Instagram is among its choices; anywhere else the
 * picture is saved. Closing the sheet is a choice, not a failure.
 */
export async function shareOrDownload(
  file: File,
  caption: string,
  nav: Partial<ShareNavigator> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
  download: (file: File) => void = (picture) => downloadBlob(picture, picture.name),
): Promise<ShareOutcome> {
  if (canShareFile(file, nav)) {
    try {
      await nav!.share!({ files: [file], text: caption });
      return "shared";
    } catch (caught) {
      if (errorName(caught) === "AbortError") return "cancelled";
      // The sheet refused the file: fall through to saving it.
    }
  }
  download(file);
  return "downloaded";
}
