import { Button } from "@/components/ui/button";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { storyFinderMessages } from "@/lib/i18n/messages/story-finder";
import type { StoryRunStatus } from "@/lib/story-agent/agent";
import type { MentionPlatform } from "@/lib/story-finder/mention";

type Messages = (typeof storyFinderMessages)[Locale];

export type StoryStepRow = {
  kind: "read" | "drafted" | "citation_rejected" | "rewrote" | "checked" | "dropped";
  count?: number;
  detail?: string;
  sentence?: string;
  words?: string;
  added?: readonly string[];
};
export type StoryRunRow = {
  id: string;
  placeName: string;
  placeSlug: string;
  status: StoryRunStatus;
  steps: readonly StoryStepRow[];
  writer?: string;
  checker?: string;
  published?: number;
  error?: string;
};

function platformLabels(m: Messages, detail: string | undefined) {
  return (detail ?? "")
    .split(", ")
    .map((platform) => m[platform as MentionPlatform] ?? platform)
    .join(", ");
}

/** One line of the run's log, in words a steward can follow. */
export function stepText(m: Messages, step: StoryStepRow): string {
  const count = String(step.count ?? 0);
  const sentence = step.sentence ?? "";
  const detail = step.detail ?? "";
  switch (step.kind) {
    case "read":
      return format(m.agentStepRead, { count, platforms: platformLabels(m, step.detail) });
    case "drafted":
      return format(m.agentStepDrafted, { count });
    case "citation_rejected":
      return format(m.agentStepRejected, { words: step.words ?? "", detail });
    case "rewrote":
      return format(detail === "check" ? m.agentStepRewroteCheck : m.agentStepRewroteCitations, {
        count,
      });
    case "checked":
      return step.added?.length
        ? format(m.agentStepFlagged, { sentence, added: step.added.join("; ") })
        : format(m.agentStepPassed, { sentence });
    case "dropped":
      return format(m.agentStepDropped, { sentence, detail });
  }
}

function statusText(m: Messages, run: StoryRunRow): string {
  switch (run.status) {
    case "queued":
      return m.agentQueued;
    case "waiting":
      return m.agentWaiting;
    case "running":
      return m.agentRunning;
    case "published":
      return format(m.agentPublished, { count: String(run.published ?? 0) });
    case "nothing":
      return m.agentNothing;
    case "failed":
      return format(m.agentFailed, { error: run.error ?? "no reason recorded" });
  }
}

export function StoryAgentView({
  locale,
  ready,
  runs,
  pending,
  error,
  onWrite,
}: {
  locale: Locale;
  ready: readonly { id: string; placeName: string; placeSlug: string; posts: number }[];
  runs: readonly StoryRunRow[];
  pending?: string;
  error?: string;
  onWrite(placeId: string): void;
}) {
  const m = messagesFor(storyFinderMessages, locale);
  const placeHref = (slug: string) => localePath(locale, `/places/${slug}`);
  return (
    <section id="story-agent" className="min-w-0 space-y-4">
      <h2 className="text-[22px] font-bold">{m.agentTitle}</h2>
      <p className="max-w-prose">{m.agentIntro}</p>
      {error && <p role="alert">{error}</p>}
      {ready.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[18px] font-bold">{m.agentReady}</h3>
          <ul className="space-y-2">
            {ready.map((place) => (
              <li key={place.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <a className="text-ai underline" href={placeHref(place.placeSlug)}>
                  {place.placeName}
                </a>
                <span>{format(m.agentPosts, { count: String(place.posts) })}</span>
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={!!pending}
                  onClick={() => onWrite(place.id)}
                >
                  {m.agentWrite}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-[18px] font-bold">{m.agentRuns}</h3>
        {runs.length === 0 && <p>{m.agentNone}</p>}
        {runs.map((run) => (
          <article key={run.id} data-run={run.status} className="space-y-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <a className="font-bold text-ai underline" href={placeHref(run.placeSlug)}>
                {run.placeName}
              </a>
              <span role="status">{statusText(m, run)}</span>
            </div>
            {run.writer && run.checker && (
              <p className="text-[15px]">
                {format(m.agentModels, { writer: run.writer, checker: run.checker })}
              </p>
            )}
            {run.steps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-6 text-[15px]">
                {run.steps.map((step, index) => (
                  <li key={index} data-step={step.kind} className="break-words">
                    {stepText(m, step)}
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
