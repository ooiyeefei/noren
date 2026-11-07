"use client";

import { ConvexError } from "convex/values";
import { errorParts } from "@/components/layout/error-text";
import { useAction, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";
import { toSpeechWav } from "@/lib/audio/speech-wav";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { voiceMessages } from "@/lib/i18n/messages/voice";
import { activeRegionConfig } from "@/lib/region/registry";

export type VoiceState =
  "ready" | "starting" | "recording" | "sending" | "done" | "failed" | "permission" | "unsupported";
export type VoiceActions = { transcribe(audio: Blob, language: Locale): Promise<string> };
type Props = {
  locale: Locale;
  onText(text: string): void;
  disabled?: boolean;
  maxSeconds: number;
  actions: VoiceActions;
};
const BUTTON =
  "min-h-11 rounded-[10px] border border-kon px-4 py-2 font-bold text-kon disabled:opacity-50";

/** No recording or agreement tick goes into the form's persisted draft. */
export function VoiceRecorder({ locale, onText, disabled, maxSeconds, actions }: Props) {
  const m = messagesFor(voiceMessages, locale);
  const [state, setState] = useState<VoiceState>("ready");
  const [language, setLanguage] = useState<Locale>(locale);
  const [agreed, setAgreed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<string>();
  const live = useRef(false);
  const locked = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const latest = useRef({ onText, disabled, actions });
  useEffect(() => {
    latest.current = { onText, disabled, actions };
  }, [onText, disabled, actions]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanup.current();
    };
  }, []);
  async function start() {
    if (locked.current || disabled || !agreed) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("unsupported");
      return;
    }
    locked.current = true;
    setFailure(undefined);
    setState("starting");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!live.current || latest.current.disabled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // Let Safari choose its supported MP4 encoding; the shared converter produces speech WAV.
      const media = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      recorder.current = media;
      const chunks: Blob[] = [];
      const began = Date.now();
      let failed = false;
      const timer = setInterval(() => {
        if (live.current) setElapsed(Math.min(maxSeconds, Math.floor((Date.now() - began) / 1000)));
      }, 250);
      const deadline = setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, maxSeconds * 1000);
      cleanup.current = () => {
        clearInterval(timer);
        clearTimeout(deadline);
        stream?.getTracks().forEach((t) => t.stop());
      };
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onerror = () => {
        failed = true;
        cleanup.current();
        locked.current = false;
        if (live.current) setState("failed");
      };
      media.onstop = () => {
        cleanup.current();
        if (!live.current || failed) return;
        setState("sending");
        void (async () => {
          try {
            const wav = await toSpeechWav(
              new Blob(chunks, { type: media.mimeType || chunks[0]?.type || "audio/mp4" }),
            );
            if (!live.current) return;
            const text = await latest.current.actions.transcribe(wav, language);
            if (live.current) {
              latest.current.onText(text);
              setState("done");
            }
          } catch (error) {
            console.error(
              `speech input failed (${error instanceof Error ? error.name || "Error" : "NonError"})`,
            );
            if (live.current) {
              setFailure(error instanceof ConvexError ? errorParts(error, locale).text : undefined);
              setState("failed");
            }
          } finally {
            locked.current = false;
          }
        })();
      };
      media.start();
      setElapsed(0);
      setState("recording");
    } catch (error) {
      cleanup.current();
      stream?.getTracks().forEach((t) => t.stop());
      locked.current = false;
      if (live.current)
        setState(
          error instanceof Error &&
            (error.name === "NotAllowedError" || error.name === "PermissionDeniedError")
            ? "permission"
            : "failed",
        );
    }
  }
  const busy = state === "starting" || state === "recording" || state === "sending";
  return (
    <section className="space-y-2 rounded-[10px] border border-line p-3" aria-label={m.record}>
      <p className="text-[13px] text-muted-foreground">{m.consent}</p>
      <label className="flex min-h-11 items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={agreed}
          disabled={busy || disabled}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        {m.agree}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 items-center gap-2 text-[14px]">
          {m.language}
          <select
            className="min-h-11 rounded border border-input bg-background px-2"
            value={language}
            disabled={busy || disabled}
            onChange={(e) => setLanguage(e.target.value as Locale)}
          >
            <option value="en">{m.english}</option>
            <option value="ja">{m.japanese}</option>
          </select>
        </label>
        {state === "recording" ? (
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              if (recorder.current?.state === "recording") recorder.current.stop();
            }}
          >
            {m.stop}
          </button>
        ) : (
          <button
            type="button"
            className={BUTTON}
            disabled={busy || disabled || !agreed}
            onClick={() => void start()}
          >
            {m.record}
          </button>
        )}
      </div>
      <VoiceStatus
        locale={locale}
        state={state}
        failure={failure}
        elapsed={elapsed}
        maxSeconds={maxSeconds}
      />
    </section>
  );
}

export function VoiceStatus({
  locale,
  state,
  elapsed,
  maxSeconds,
  failure,
}: {
  locale: Locale;
  failure?: string;
  state: VoiceState;
  elapsed: number;
  maxSeconds: number;
}) {
  const m = messagesFor(voiceMessages, locale);
  const error = state === "failed" || state === "permission" || state === "unsupported";
  return (
    <p
      role={error ? "alert" : state === "recording" ? "timer" : "status"}
      className={`text-[14px] ${error ? "text-beni" : "text-muted-foreground"}`}
    >
      {state === "recording"
        ? format(m.timer, { seconds: elapsed, max: maxSeconds })
        : state === "ready"
          ? format(m.ready, { max: maxSeconds })
          : state === "failed"
            ? (failure ?? m.failed)
            : m[state]}
    </p>
  );
}

function ConnectedRecorder(props: Omit<Props, "actions">) {
  const upload = useMutation(api.storyVoice.generateUploadUrl);
  const transcribe = useAction(api.storyVoice.transcribe);
  const actions: VoiceActions = {
    async transcribe(audio, language) {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", await audio.arrayBuffer()),
      );
      const sha256 = btoa(String.fromCharCode(...digest));
      const { uploadId, url } = await upload({ sha256 });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: audio,
      });
      if (!response.ok) throw new Error("UploadFailed");
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("storageId" in result) ||
        typeof result.storageId !== "string"
      )
        throw new Error("InvalidUploadResponse");
      return transcribe({ uploadId, storageId: result.storageId as Id<"_storage">, language });
    },
  };
  return <VoiceRecorder {...props} actions={actions} />;
}

export function VoiceInput({
  locale,
  onText,
  disabled,
}: {
  locale: Locale;
  onText(text: string): void;
  disabled?: boolean;
}) {
  const config = activeRegionConfig().voice;
  const m = messagesFor(voiceMessages, locale);
  return (
    <div className="space-y-2">
      <p className="hidden [@media(pointer:coarse)]:block text-[13px] text-muted-foreground">
        {m.hint}
      </p>
      {config.enabled && (
        <ConnectedRecorder
          locale={locale}
          maxSeconds={config.maxSeconds}
          onText={onText}
          disabled={disabled}
        />
      )}
    </div>
  );
}
