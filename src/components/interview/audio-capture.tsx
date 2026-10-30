"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { interviewUiMessages } from "@/lib/i18n/messages/interview-ui";

export function AudioCapture(props: {
  locale: Locale;
  maxSeconds: number;
  disabled?: boolean;
  onRecorded(audio: Blob, durationS: number | undefined): void;
}): React.JSX.Element {
  const m = messagesFor(interviewUiMessages, props.locale);
  const id = useId();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const disabled = useRef(props.disabled);
  const callback = useRef(props.onRecorded);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    callback.current = props.onRecorded;
  }, [props.onRecorded]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    disabled.current = props.disabled;
    if (props.disabled && recorder.current?.state === "recording") recorder.current.stop();
  }, [props.disabled]);
  async function start() {
    if (starting || recording || props.disabled) return;
    setStarting(true);
    setUnavailable(false);
    let acquired: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("Unavailable");
      acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || disabled.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      const media = new MediaRecorder(acquired, { audioBitsPerSecond: 32000 });
      recorder.current = media;
      const chunks: Blob[] = [];
      const began = Date.now();
      const limit = Math.max(0, Number.isFinite(props.maxSeconds) ? props.maxSeconds : 0);
      let failed = false;
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const timer = setInterval(() => {
        if (mounted.current) setElapsed(Math.min(limit, Math.floor((Date.now() - began) / 1000)));
      }, 250);
      const deadline = setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, limit * 1000);
      const cleanup = () => {
        clearInterval(timer);
        clearTimeout(deadline);
        acquired?.getTracks().forEach((track) => track.stop());
      };
      media.onerror = () => {
        failed = true;
        cleanup();
        if (mounted.current) {
          setUnavailable(true);
          setRecording(false);
        }
      };
      media.onstop = () => {
        cleanup();
        if (!mounted.current) return;
        const duration = Math.min(limit, (Date.now() - began) / 1000);
        setElapsed(duration);
        setRecording(false);
        if (!failed && chunks.length)
          callback.current(
            new Blob(chunks, { type: media.mimeType || chunks[0]?.type || "audio/webm" }),
            duration,
          );
      };
      try {
        media.start();
      } catch (error) {
        cleanup();
        throw error;
      }
      setElapsed(0);
      setRecording(true);
    } catch {
      acquired?.getTracks().forEach((track) => track.stop());
      if (mounted.current) setUnavailable(true);
    } finally {
      if (mounted.current) setStarting(false);
    }
  }
  return (
    <section lang={props.locale} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={props.disabled || starting || recording || props.maxSeconds <= 0}
          onClick={() => void start()}
        >
          {m.record}
        </Button>
        <Button
          type="button"
          disabled={!recording}
          onClick={() => {
            if (recorder.current?.state === "recording") recorder.current.stop();
          }}
        >
          {m.stop}
        </Button>
      </div>
      <p role="timer">{format(m.elapsed, { seconds: Math.floor(elapsed) })}</p>
      {unavailable && <Alert>{m.microphoneUnavailable}</Alert>}
      <Label htmlFor={id}>{m.chooseFile}</Label>
      <Input
        id={id}
        type="file"
        accept="audio/*"
        disabled={props.disabled || recording || starting}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) props.onRecorded(file, undefined);
          event.currentTarget.value = "";
        }}
      />
    </section>
  );
}
