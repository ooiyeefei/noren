import { cardFileName, cardPath, type CardSize } from "./card";
import { downloadBlob, fetchPicture, shareOrDownload, type ShareOutcome } from "./share-file";

/** What the button needs from the browser; tests supply their own. */
export type PictureDeps = {
  fetcher?: typeof fetch;
  nav?: Partial<Pick<Navigator, "canShare" | "share" | "clipboard">>;
  download?: (file: File) => void;
};

/** Makes the picture and offers it to the share sheet, or saves it. */
export async function sharePicture(
  input: { storyId: string; size: CardSize; caption: string; photo?: boolean },
  deps: PictureDeps = {},
): Promise<ShareOutcome> {
  const file = await fetchPicture(
    cardPath(input.storyId, input.size, { photo: input.photo }),
    cardFileName(input.size),
    deps.fetcher,
  );
  return shareOrDownload(file, input.caption, deps.nav, deps.download);
}

/** Saves the picture without offering the share sheet. */
export async function downloadPicture(
  input: { storyId: string; size: CardSize; photo?: boolean },
  deps: Pick<PictureDeps, "fetcher" | "download"> = {},
): Promise<void> {
  const file = await fetchPicture(
    cardPath(input.storyId, input.size, { photo: input.photo }),
    cardFileName(input.size),
    deps.fetcher,
  );
  (deps.download ?? ((picture) => downloadBlob(picture, picture.name)))(file);
}

/** Copies the caption; false when the browser refuses, so the page can say so. */
export async function copyCaption(
  caption: string,
  nav: Partial<Pick<Navigator, "clipboard">> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): Promise<boolean> {
  try {
    if (!nav?.clipboard) return false;
    await nav.clipboard.writeText(caption);
    return true;
  } catch {
    return false;
  }
}
