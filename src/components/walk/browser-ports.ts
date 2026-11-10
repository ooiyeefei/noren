import type { SpeechPort, WakeLockPort } from "@/lib/walk/controller";
import type { VoiceLike } from "@/lib/walk/voice";

// The phone's own speaker, screen lock and visibility, as the walk controller's ports. Nothing in
// this file touches the network. Speech uses the browser's speechSynthesis, and the planner
// (src/lib/walk/voice.ts) only ever hands it voices that run on the phone.

export function browserSpeech(): SpeechPort | undefined {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return undefined;
  const synth = window.speechSynthesis;
  const natives = new Map<string, SpeechSynthesisVoice>();
  // Bumped by every speak and cancel, so the end of a cut-off utterance cannot undo a newer one.
  let generation = 0;
  return {
    voices(): VoiceLike[] {
      natives.clear();
      return synth.getVoices().map((voice) => {
        natives.set(voice.voiceURI, voice);
        return {
          voiceURI: voice.voiceURI,
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          default: voice.default,
        };
      });
    },
    speak(items, handlers) {
      const mine = ++generation;
      items.forEach((item, index) => {
        const utterance = new SpeechSynthesisUtterance(item.text);
        const voice = natives.get(item.voice.voiceURI);
        if (voice) utterance.voice = voice;
        utterance.lang = item.voice.lang;
        utterance.rate = 0.95;
        if (index === 0)
          utterance.onstart = () => {
            if (mine === generation) handlers.onStart();
          };
        if (index === items.length - 1) {
          const end = () => {
            if (mine === generation) handlers.onEnd();
          };
          utterance.onend = end;
          utterance.onerror = end;
        }
        synth.speak(utterance);
      });
    },
    cancel() {
      generation++;
      synth.cancel();
    },
    unlock() {
      // A silent utterance in the tap that turned sound on: some phones speak later only if they
      // have spoken once in response to a tap.
      const utterance = new SpeechSynthesisUtterance(" ");
      utterance.volume = 0;
      synth.speak(utterance);
    },
    onVoicesChanged(callback) {
      synth.addEventListener("voiceschanged", callback);
      return () => synth.removeEventListener("voiceschanged", callback);
    },
  };
}

export function browserWakeLock(): WakeLockPort | undefined {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return undefined;
  return { request: () => navigator.wakeLock.request("screen") };
}

/** Calls back each time the page comes to the front, when a screen lock has been let go. */
export function onPageVisible(callback: () => void): () => void {
  const listener = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
