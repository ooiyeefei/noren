"use client";

import { useAuth } from "@clerk/nextjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { indexedDbPhotoStore, photoDraftKey, type PhotoDraftStore } from "@/lib/drafts/photo-store";
import {
  DRAFT_TTL_MS,
  clearDraftScope,
  draftData,
  draftKey,
  draftScope,
  freshDraft,
  removeDraft,
  sweepDrafts,
  writeDraft,
  type DraftStorage,
} from "@/lib/drafts/storage";

type Drafts = {
  /** Null while sign-in loads, and outside the provider, where nothing is kept. */
  scope: string | null;
  storage(): DraftStorage | null;
  photos: PhotoDraftStore | null;
};
const NOTHING_KEPT: Drafts = { scope: null, storage: () => null, photos: null };
const DraftsContext = createContext<Drafts>(NOTHING_KEPT);

/** A member's drafts stay on the device; a signed-out visitor's last as long as the tab. */
function browserStorage(scope: string | null): DraftStorage | null {
  if (scope === null) return null;
  try {
    return scope === "anon" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/** Keeps unsent forms through a reload. Inside ClerkProvider, so drafts belong to whoever is signed in. */
export function DraftsProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const scope = draftScope(isLoaded, userId);
  const [photos] = useState(() => (typeof window === "undefined" ? null : indexedDbPhotoStore()));
  const last = useRef<string | null>(null);
  useEffect(() => {
    const before = last.current;
    if (scope !== null) last.current = scope;
    // Signing out, or in as someone else, takes the last member's drafts off this device.
    if (before?.startsWith("u:") && scope !== null && scope !== before) {
      const kept = browserStorage(before);
      if (kept) clearDraftScope(kept, before);
      void photos?.clearScope(before);
    }
  }, [scope, photos]);
  useEffect(() => {
    const now = Date.now();
    for (const scoped of ["anon", "u:"]) {
      const kept = browserStorage(scoped);
      if (kept) sweepDrafts(kept, now);
    }
    void photos?.sweep(now);
  }, [photos]);
  const drafts = useMemo<Drafts>(
    () => ({ scope, storage: () => browserStorage(scope), photos }),
    [scope, photos],
  );
  return <DraftsContext value={drafts}>{children}</DraftsContext>;
}

const NO_CHANGES = () => () => {};

/**
 * useState that survives a reload. `name` says which form and which place or item it is for; null keeps
 * nothing. Setting the value back to `empty` removes the draft, so a shared or cleared form leaves none.
 * Bump `version` when the shape of the value changes, so an old draft is not read as a new one.
 * `ttlMs` shortens how long it is kept, for state that only makes sense on the same visit.
 */
export function useDraft<T>(
  name: string | null | undefined,
  empty: T,
  version = 1,
  ttlMs = DRAFT_TTL_MS,
): [T, Dispatch<SetStateAction<T>>] {
  const { scope, storage } = useContext(DraftsContext);
  const key = scope !== null && name ? draftKey(scope, name) : null;
  const raw = useSyncExternalStore(
    NO_CHANGES,
    () => {
      const kept = key === null ? null : storage();
      return kept && key !== null
        ? freshDraft(kept.getItem(key), version, Date.now(), ttlMs)
        : null;
    },
    () => null,
  );
  const emptyText = JSON.stringify(empty);
  const kept = useMemo(() => (raw === null ? undefined : draftData<T>(raw)), [raw]);
  // What the member changed on this page; until then the form shows what was kept, or empty.
  // Changes made before sign-in had loaded have no key yet, and belong to the first one that comes.
  const [edits, setEdits] = useState<{ key: string | null; value: T } | null>(null);
  const ours = edits !== null && (edits.key === key || edits.key === null);
  const shown = ours ? edits.value : (kept ?? empty);
  const save = useCallback(
    (value: T) => {
      const kept = key === null ? null : storage();
      if (!kept || key === null) return;
      if (JSON.stringify(value) === emptyText) removeDraft(kept, key);
      else writeDraft(kept, key, value, version, Date.now());
    },
    [key, storage, emptyText, version],
  );
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      // A form often closes in the same update that resets it, and a closed form runs no effects,
      // so a plain value is saved, or cleared, here and then.
      if (typeof action !== "function") save(action);
      setEdits((current) => {
        const before =
          current !== null && (current.key === key || current.key === null)
            ? current.value
            : (kept ?? (JSON.parse(emptyText) as T));
        const value =
          typeof action === "function" ? (action as (previous: T) => T)(before) : action;
        return { key, value };
      });
    },
    [key, kept, emptyText, save],
  );
  useEffect(() => {
    if (ours) save(edits.value);
  }, [ours, edits, save]);
  return [shown, set];
}

/** Where a form's picked photos are kept, or null when they cannot be. */
export function usePhotoDrafts(name: string | null | undefined) {
  const { scope, photos } = useContext(DraftsContext);
  // Photos are only ever picked when signed in.
  const key = photos && scope?.startsWith("u:") && name ? photoDraftKey(scope, name) : null;
  return useMemo(
    () => (key === null || photos === null ? null : { store: photos, key }),
    [key, photos],
  );
}
