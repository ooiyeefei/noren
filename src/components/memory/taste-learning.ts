"use client";

import { useCallback, useEffect } from "react";
import { useFeatureLinks } from "@/components/layout/features";
import { learn } from "@/lib/memory";
import { memoryStore } from "./use-memory";

/**
 * Noren notices tastes from what a visitor opens and saves, and keeps them on their own device only
 * (src/lib/memory). It does nothing at all while the planner is switched off, so no page writes to
 * the device before the privacy notice names it.
 *
 * Opening a place's page counts as an open. The returned function counts a save: stamping a place
 * or sharing a story or post about it.
 */
export function useTasteLearning(category: string | undefined, slug: string | undefined) {
  const { planner } = useFeatureLinks();
  useEffect(() => {
    if (!planner || category === undefined) return;
    memoryStore().update((memory, clock) => learn(memory, { category, action: "open" }, clock));
  }, [planner, category, slug]);
  return useCallback(() => {
    if (!planner || category === undefined) return;
    memoryStore().update((memory, clock) => learn(memory, { category, action: "save" }, clock));
  }, [planner, category]);
}
