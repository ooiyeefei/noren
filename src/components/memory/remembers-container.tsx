"use client";

import { useConvexAuth } from "convex/react";
import { useState } from "react";
import { VoiceInput } from "@/components/voice/voice-input";
import type { Locale } from "@/lib/i18n";
import {
  addRule,
  addTaste,
  addVisited,
  removeRule,
  removeTaste,
  removeVisited,
  setKept,
} from "@/lib/memory";
import { fillField } from "./chip";
import { RemembersView } from "./remembers-view";
import { useMemory } from "./use-memory";

/**
 * "What Noren remembers", wired to the device. It works signed out. The voice input uploads a short
 * recording to be turned into words, so it is offered to signed-in members only.
 */
export function RemembersContainer({
  locale,
  checkable,
}: {
  locale: Locale;
  checkable: readonly string[];
}) {
  const { memory, now, update, forgetAll, canKeep } = useMemory();
  const { isAuthenticated } = useConvexAuth();
  const [forgotten, setForgotten] = useState(false);
  const change = (fn: Parameters<typeof update>[0]) => {
    setForgotten(false);
    update(fn);
  };
  return (
    <RemembersView
      locale={locale}
      memory={memory}
      now={now}
      checkable={checkable}
      canKeep={canKeep}
      forgotten={forgotten}
      voice={
        isAuthenticated
          ? (fieldId) => <VoiceInput locale={locale} onText={(text) => fillField(fieldId, text)} />
          : undefined
      }
      onAddRule={(text) => change((m) => addRule(m, text))}
      onRemoveRule={(id) => change((m) => removeRule(m, id))}
      onAddTaste={(text) => change((m, clock) => addTaste(m, text, clock))}
      onRemoveTaste={(key) => change((m) => removeTaste(m, key))}
      onAddVisited={(text) => change((m, clock) => addVisited(m, { label: text }, clock))}
      onRemoveVisited={(id) => change((m) => removeVisited(m, id))}
      onKeepVisited={(id, kept) => change((m) => setKept(m, id, kept))}
      onForgetAll={() => {
        forgetAll();
        setForgotten(true);
      }}
    />
  );
}
