// Mono 16-bit PCM WAV, the format speech services that cannot decode compressed audio accept.

export type WavInfo = {
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  /** The PCM samples, clamped to the bytes actually present. */
  data: Uint8Array;
};

function header(dataBytes: number, sampleRate: number, channels: number, bitsPerSample: number) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const view = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(view.buffer);
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(44 + samples.length * 2));
  bytes.set(header(samples.length * 2, sampleRate, 1, 16));
  const view = new DataView(bytes.buffer, 44);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] || 0));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

export function readWav(bytes: Uint8Array): WavInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    offset + 4 > bytes.length ? "" : String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let fmt: Omit<WavInfo, "data"> | undefined;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data" && fmt) {
      // Streaming writers leave the size at its maximum; trust the bytes present.
      return { ...fmt, data: bytes.subarray(body, Math.min(bytes.length, body + size)) };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Splits PCM audio into WAV files of at most maxSeconds each, cut on sample boundaries. */
export function splitWav(info: WavInfo, maxSeconds: number): Uint8Array<ArrayBuffer>[] {
  const blockAlign = (info.channels * info.bitsPerSample) / 8;
  const partBytes = Math.max(1, Math.floor(maxSeconds * info.sampleRate)) * blockAlign;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const usable = info.data.length - (info.data.length % blockAlign);
  for (let start = 0; start < usable; start += partBytes) {
    const slice = info.data.subarray(start, Math.min(usable, start + partBytes));
    const part = new Uint8Array(new ArrayBuffer(44 + slice.length));
    part.set(header(slice.length, info.sampleRate, info.channels, info.bitsPerSample));
    part.set(slice, 44);
    parts.push(part);
  }
  return parts;
}
