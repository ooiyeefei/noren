import { DRAFT_TTL_MS } from "./storage";

/**
 * Photos picked for a story that is not shared yet, kept in the browser's IndexedDB with the files
 * themselves, so a reloaded page can show them again and finish an upload the reload cut off.
 */

export type KeptPhoto = {
  id: number;
  file: Blob;
  /** Set once the server has the photo. */
  photoId?: string;
  uploadedAt?: number;
};

export type PhotoDraftStore = {
  load(key: string): Promise<KeptPhoto[]>;
  /** An empty list removes the entry. */
  save(key: string, photos: readonly KeptPhoto[]): Promise<void>;
  clearScope(scope: string): Promise<void>;
  sweep(now: number): Promise<void>;
};

/**
 * The server removes photos never shared after a while, so an old upload is sent again rather than
 * attached. Everything else keeps the photo the server already has.
 */
export function canReuseUpload(photo: KeptPhoto, now: number, keepUploadsForMs: number): boolean {
  return (
    photo.photoId !== undefined &&
    photo.uploadedAt !== undefined &&
    now - photo.uploadedAt < keepUploadsForMs
  );
}

export function photoDraftKey(scope: string, name: string): string {
  return `${scope}:${name}`;
}

const DB_NAME = "noren-drafts";
const STORE = "photos";
type Row = { key: string; at: number; photos: KeptPhoto[] };

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function failed(what: string, error: unknown) {
  const name = error instanceof Error ? error.name || "Error" : typeof error;
  console.error(`photo draft ${what} failed: ${name}`);
}

/** Null where the browser has no IndexedDB; the picker then works as it did before drafts. */
export function indexedDbPhotoStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): PhotoDraftStore | null {
  if (!factory) return null;
  let opening: Promise<IDBDatabase> | undefined;
  const db = () =>
    (opening ??= new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  const forEachRow = async (range: IDBKeyRange | null, drop: (row: Row) => boolean) => {
    const transaction = (await db()).transaction(STORE, "readwrite");
    const request = transaction.objectStore(STORE).openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (drop(cursor.value as Row)) cursor.delete();
      cursor.continue();
    };
    await finished(transaction);
  };
  return {
    async load(key) {
      try {
        const store = (await db()).transaction(STORE, "readonly").objectStore(STORE);
        const row = (await done(store.get(key))) as Row | undefined;
        return row && Date.now() - row.at < DRAFT_TTL_MS ? row.photos : [];
      } catch (error) {
        failed("load", error);
        return [];
      }
    },
    async save(key, photos) {
      try {
        const transaction = (await db()).transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        if (photos.length === 0) store.delete(key);
        else store.put({ key, at: Date.now(), photos: [...photos] } satisfies Row);
        await finished(transaction);
      } catch (error) {
        failed("save", error);
      }
    },
    async clearScope(scope) {
      try {
        const prefix = `${scope}:`;
        await forEachRow(IDBKeyRange.bound(prefix, `${prefix}￿`), () => true);
      } catch (error) {
        failed("clear", error);
      }
    },
    async sweep(now) {
      try {
        await forEachRow(null, (row) => now - row.at >= DRAFT_TTL_MS);
      } catch (error) {
        failed("sweep", error);
      }
    },
  };
}
