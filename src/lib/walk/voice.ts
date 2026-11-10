// Choosing a voice for walk mode. Only voices that run on the phone itself are ever used: a voice
// with localService false sends the words to a server to be spoken, and walk mode never does that.
// With no local voice for a language, the words are shown and not spoken.

export type VoiceLike = {
  voiceURI: string;
  name: string;
  lang: string;
  /** True when the voice runs on this device. */
  localService: boolean;
  default?: boolean;
};

/** One piece of speech: the words and the language they are in. */
export type SpeechPart = { text: string; lang: string };

const normalise = (tag: string) => tag.trim().toLowerCase().replace(/_/g, "-");
const primary = (tag: string) => normalise(tag).split("-")[0] ?? "";

/**
 * A local voice for the language, or null. "ja" matches "ja-JP" and "ja_JP" (Android writes an
 * underscore); "en-GB" prefers an en-GB voice and otherwise takes any English one. The phone's
 * default voice wins among equals.
 */
export function pickLocalVoice<V extends VoiceLike>(voices: readonly V[], lang: string): V | null {
  const wanted = normalise(lang);
  if (wanted === "") return null;
  const local = voices.filter(
    (voice) => voice.localService === true && primary(voice.lang) === primary(wanted),
  );
  const exact = local.filter((voice) => normalise(voice.lang) === wanted);
  const pool = exact.length > 0 ? exact : local;
  return pool.find((voice) => voice.default === true) ?? pool[0] ?? null;
}

export type SpeechPlan<V extends VoiceLike> =
  | { ok: true; items: { text: string; lang: string; voice: V }[] }
  | { ok: false; missing: string[] };

/**
 * Every part needs a local voice for its own language, or nothing is spoken. Half an announcement
 * (the credit in English and the story in silence) is worse than the words on screen.
 */
export function planSpeech<V extends VoiceLike>(
  parts: readonly SpeechPart[],
  voices: readonly V[],
): SpeechPlan<V> {
  const items: { text: string; lang: string; voice: V }[] = [];
  const missing: string[] = [];
  for (const part of parts) {
    if (part.text.trim() === "") continue;
    const voice = pickLocalVoice(voices, part.lang);
    if (voice === null) {
      if (!missing.includes(primary(part.lang))) missing.push(primary(part.lang));
    } else {
      items.push({ text: part.text, lang: part.lang, voice });
    }
  }
  if (missing.length > 0 || items.length === 0) return { ok: false, missing };
  return { ok: true, items };
}
