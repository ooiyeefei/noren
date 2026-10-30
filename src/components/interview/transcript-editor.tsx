"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { messagesFor, type Locale } from "@/lib/i18n";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";
import { selectionToSpan } from "./span";

export type EditableSegment = { start: number; end: number; speaker?: string; text: string };
type Span = { spanStart: number; spanEnd: number; quote: string };

/** Segment times are seconds from the start of the recording: m:ss, or h:mm:ss past an hour. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  return minutes < 60
    ? `${minutes}:${s}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${s}`;
}

export function TranscriptEditor(props: {
  locale: Locale;
  segments: readonly EditableSegment[];
  lang: string;
  readOnly?: boolean;
  saving?: boolean;
  speakers?: readonly string[];
  onSave(segments: EditableSegment[]): Promise<void>;
  onProposeSpan?(span: Span): void;
}): React.JSX.Element {
  const m = messagesFor(interviewUiMessages, props.locale);
  const id = useId();
  const sourceKey = JSON.stringify(props.segments);
  const [source, setSource] = useState(sourceKey);
  const [draft, setDraft] = useState(() => props.segments.map((segment) => ({ ...segment })));
  const [selection, setSelection] = useState<Span | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (source !== sourceKey) {
    setSource(sourceKey);
    setDraft(props.segments.map((segment) => ({ ...segment })));
    setSelection(null);
  }
  const dirty = JSON.stringify(draft) !== sourceKey;
  const busy = props.saving || pending;
  const locked = props.readOnly || busy;
  function update(index: number, change: Partial<EditableSegment>) {
    setSelection(null);
    setDraft((current) =>
      current.map((segment, i) => (i === index ? { ...segment, ...change } : segment)),
    );
  }
  return (
    <section lang={props.locale} className="space-y-4">
      {draft.map((segment, index) => (
        <div key={index} data-segment={index} className="space-y-2 rounded-lg border p-3">
          <p>
            {formatTime(segment.start)}–{formatTime(segment.end)}
          </p>
          <Label htmlFor={`${id}-speaker-${index}`}>{m.speaker}</Label>
          <select
            id={`${id}-speaker-${index}`}
            className="max-w-full rounded-md border p-2"
            value={segment.speaker ?? ""}
            disabled={locked}
            onChange={(event) => update(index, { speaker: event.target.value || undefined })}
          >
            <option value="">{m.unknownSpeaker}</option>
            {Array.from(
              new Set([...(props.speakers ?? []), ...(segment.speaker ? [segment.speaker] : [])]),
            ).map((speaker) => (
              <option key={speaker} value={speaker}>
                {speaker}
              </option>
            ))}
          </select>
          <Label htmlFor={`${id}-text-${index}`}>
            {m.transcript} {index + 1}
          </Label>
          <Textarea
            id={`${id}-text-${index}`}
            lang={props.lang}
            value={segment.text}
            readOnly={props.readOnly}
            disabled={busy}
            onChange={(event) => update(index, { text: event.target.value })}
            onSelect={(event) => {
              setSelection(
                selectionToSpan(
                  draft,
                  index,
                  event.currentTarget.selectionStart,
                  event.currentTarget.selectionEnd,
                ),
              );
            }}
          />
          {!props.readOnly && (
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => {
                setSelection(null);
                setDraft((current) => current.filter((_, i) => i !== index));
              }}
            >
              {m.removeSegment}
            </Button>
          )}
        </div>
      ))}
      {dirty && <p role="status">{m.unsavedChanges}</p>}
      {failed && <Alert variant="destructive">{m.actionFailed}</Alert>}
      <div className="flex flex-wrap gap-2">
        {!props.readOnly && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => {
                setSelection(null);
                setDraft((current) => {
                  const end = current.at(-1)?.end ?? 0;
                  return [...current, { start: end, end, text: "" }];
                });
              }}
            >
              {m.addSegment}
            </Button>
            <Button
              type="button"
              disabled={locked}
              onClick={async () => {
                setPending(true);
                setFailed(false);
                try {
                  await props.onSave(draft.map((segment) => ({ ...segment })));
                } catch {
                  setFailed(true);
                } finally {
                  setPending(false);
                }
              }}
            >
              {busy ? m.saving : m.saveCorrected}
            </Button>
          </>
        )}
        {props.onProposeSpan && (
          <Button
            type="button"
            disabled={dirty || busy || !selection}
            onClick={() => {
              if (!dirty && !busy && selection) props.onProposeSpan?.(selection);
            }}
          >
            {m.proposeSelection}
          </Button>
        )}
      </div>
    </section>
  );
}
