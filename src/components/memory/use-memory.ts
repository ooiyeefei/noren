"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  browserStorage,
  createMemoryStore,
  emptyMemory,
  JAPAN_UTC_OFFSET_HOURS,
  type Memory,
  type MemoryStore,
} from "@/lib/memory";

// The one memory store of this page, backed by the browser's local storage. It is created on first
// use in the browser, so the server renders an empty memory and the page fills in after it loads.

const SERVER_MEMORY: Memory = emptyMemory({ now: 0, utcOffsetHours: JAPAN_UTC_OFFSET_HOURS });

let store: MemoryStore | undefined;

export function memoryStore(): MemoryStore {
  store ??= createMemoryStore({
    storage: () => browserStorage(),
    clock: () => ({ now: Date.now(), utcOffsetHours: JAPAN_UTC_OFFSET_HOURS }),
  });
  return store;
}

export function useMemory() {
  const current = memoryStore();
  const memory = useSyncExternalStore(current.subscribe, current.get, () => SERVER_MEMORY);
  // When the page opened. Noticed tastes fade over weeks, so this is as fresh as they need.
  const [now] = useState(() => Date.now());
  useEffect(() => {
    // Another tab changed it, the day turned, or the page came back into view.
    const reload = () => current.reload();
    window.addEventListener("storage", reload);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    reload();
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [current]);
  return {
    memory,
    now,
    update: current.update,
    forgetAll: current.forgetAll,
    canKeep: current.canKeep(),
  };
}
