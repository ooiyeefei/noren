"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ErrorMessage } from "@/components/layout/error-message";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { addStoryMessages } from "@/lib/i18n/messages/add-story";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** The privacy notice's section on letting AI read a story (the planner and the connector). */
export const CONNECTOR_NOTICE_ID = "ai-reading";

function NoticeLink({ locale }: { locale: Locale }) {
  const m = messagesFor(addStoryMessages, locale);
  return (
    <a
      className="inline-flex min-h-11 items-center text-ai underline"
      href={`${localePath(locale, "/privacy")}#${CONNECTOR_NOTICE_ID}`}
      target="_blank"
      rel="noopener"
    >
      {m.connectorLink}
    </a>
  );
}

/**
 * The writer's own choice, off until ticked: AI may read the story, with their name. One tick covers
 * Noren's planner and assistants such as Claude or ChatGPT through the connector. The form shows it
 * only while the region has the connector or the planner on. It is never kept through a reload, and
 * the writer can change it later on their story.
 */
export function ConnectorTick({
  locale,
  hintId,
  checked,
  onChange,
}: {
  locale: Locale;
  hintId: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const m = messagesFor(addStoryMessages, locale);
  return (
    <div className="space-y-1">
      <label className="flex min-h-11 items-center gap-2 font-bold">
        <input
          type="checkbox"
          data-testid="connector-consent"
          checked={checked}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.checked)}
          className="size-5"
        />
        {m.connectorTick}
      </label>
      <p id={hintId} className="text-[15px] text-muted-foreground">
        {m.connectorHint} <NoticeLink locale={locale} />
      </p>
    </div>
  );
}

/**
 * Where the writer sees the choice on their own story and changes it, as they can for Instagram.
 * It shows nothing unless the region has the connector or the planner on.
 */
export function ConnectorChoice({
  locale,
  offered,
  allowed,
  onSet,
}: {
  locale: Locale;
  /** The region has the connector or the planner on. */
  offered: boolean;
  allowed: boolean;
  onSet: (on: boolean) => Promise<unknown>;
}) {
  const m = messagesFor(addStoryMessages, locale);
  const [changed, setChanged] = useState<boolean | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!offered) return null;
  async function change(on: boolean) {
    if (changing) return;
    setChanging(true);
    setError(null);
    try {
      await onSet(on);
      setChanged(on);
    } catch (caught) {
      setError(caught);
    } finally {
      setChanging(false);
    }
  }
  return (
    <div className="space-y-1" data-testid="connector-choice">
      <p className="flex flex-wrap items-center gap-x-3 text-[15px]">
        <span data-testid="connector-state">{allowed ? m.connectorOn : m.connectorOff}</span>
        <button
          type="button"
          disabled={changing}
          className="inline-flex min-h-11 items-center text-ai underline disabled:opacity-50"
          onClick={() => void change(!allowed)}
        >
          {allowed ? m.connectorStop : m.connectorAllow}
        </button>
        <NoticeLink locale={locale} />
      </p>
      <div role="status" aria-live="polite" className="text-[15px] empty:hidden">
        {changed === null ? null : changed ? m.connectorAllowed : m.connectorStopped}
      </div>
      {error !== null && <ErrorMessage error={error} locale={locale} />}
    </div>
  );
}

/**
 * The choice wired to Convex. The server answers only for the story's writer, on a live story, in a
 * region that has the connector or the planner on; for everyone else this shows nothing.
 */
export function ConnectorChoiceConnected({ locale, storyId }: { locale: Locale; storyId: string }) {
  const id = storyId as Id<"story">;
  const choice = useQuery(api.storyConnector.choiceOf, { storyId: id });
  const setAllowed = useMutation(api.storyConnector.setAllowed);
  if (!choice) return null;
  return (
    <ConnectorChoice
      locale={locale}
      offered
      allowed={choice.allowed}
      onSet={(on) => setAllowed({ storyId: id, on })}
    />
  );
}
