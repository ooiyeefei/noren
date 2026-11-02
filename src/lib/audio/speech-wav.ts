import { encodeWav } from "./wav";

export const SPEECH_SAMPLE_RATE = 16000;

/** Decodes a browser recording and re-encodes it as 16 kHz mono WAV (about 1.9 MB a minute). */
export async function toSpeechWav(audio: Blob): Promise<Blob> {
  // decodeAudioData resamples to the context's rate; rendering through one channel downmixes.
  const decoded = await new OfflineAudioContext(1, 1, SPEECH_SAMPLE_RATE).decodeAudioData(
    await audio.arrayBuffer(),
  );
  if (!decoded.length) throw new Error("the recording contains no audio");
  const context = new OfflineAudioContext(1, decoded.length, SPEECH_SAMPLE_RATE);
  const source = context.createBufferSource();
  source.buffer = decoded;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return new Blob([encodeWav(rendered.getChannelData(0), SPEECH_SAMPLE_RATE)], {
    type: "audio/wav",
  });
}
