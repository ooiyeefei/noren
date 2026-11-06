/**
 * Unsent drafts kept in the browser, so a page the phone reloads after sitting idle comes back as the
 * member left it. Nothing here leaves the device. A signed-in member's drafts sit under their own
 * Clerk id and go when they sign out; a signed-out visitor's drafts last only as long as the tab.
 */

const PREFIX = "noren:draft:";
/** A draft nobody came back to in a week is dropped. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type Saved = { v: number; at: number; data: unknown };

/** "anon" for a signed-out visitor; "u:<id>" for a member. Null while sign-in is still loading. */
export function draftScope(isLoaded: boolean, userId: string | null | undefined): string | null {
  if (!isLoaded) return null;
  return userId ? `u:${userId}` : "anon";
}

export function draftKey(scope: string, name: string): string {
  return `${PREFIX}${scope}:${name}`;
}

function savedAt(raw: string | null): Partial<Saved> | null {
  try {
    const saved: unknown = raw === null ? null : JSON.parse(raw);
    return saved !== null && typeof saved === "object" ? (saved as Partial<Saved>) : null;
  } catch {
    return null;
  }
}

/** The kept text when it is from this version of the form and inside its time, else null. */
export function freshDraft(
  raw: string | null,
  version: number,
  now: number,
  ttlMs = DRAFT_TTL_MS,
): string | null {
  const saved = savedAt(raw);
  return saved?.v === version && typeof saved.at === "number" && now - saved.at < ttlMs
    ? raw
    : null;
}

/** Only for text that freshDraft returned. */
export function draftData<T>(raw: string): T {
  return (JSON.parse(raw) as Saved).data as T;
}

export function writeDraft(
  storage: DraftStorage,
  key: string,
  value: unknown,
  version: number,
  now: number,
): void {
  try {
    storage.setItem(key, JSON.stringify({ v: version, at: now, data: value } satisfies Saved));
  } catch {
    // A full or blocked storage leaves the form working as it did before drafts were kept.
  }
}

export function removeDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // As above.
  }
}

function draftKeys(storage: DraftStorage, startingWith: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null && key.startsWith(startingWith)) keys.push(key);
  }
  return keys;
}

/** Removes every draft kept for one scope, as when a member signs out. */
export function clearDraftScope(storage: DraftStorage, scope: string): void {
  try {
    for (const key of draftKeys(storage, `${PREFIX}${scope}:`)) storage.removeItem(key);
  } catch {
    // Nothing more can be done for a storage that throws.
  }
}

/** Removes drafts past their week, whoever they belong to. */
export function sweepDrafts(storage: DraftStorage, now: number): void {
  try {
    for (const key of draftKeys(storage, PREFIX)) {
      const at = savedAt(storage.getItem(key))?.at;
      if (typeof at !== "number" || now - at >= DRAFT_TTL_MS) storage.removeItem(key);
    }
  } catch {
    // As above.
  }
}
