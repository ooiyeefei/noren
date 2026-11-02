import { describe, expect, it } from "vitest";
import { encodeWav, readWav, splitWav } from "../../src/lib/audio/wav";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

describe("wav", () => {
  it("encodes mono 16-bit PCM that reads back with clamped samples", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 2, -2]), 16000);
    expect(wav.length).toBe(44 + 10);
    const info = readWav(wav)!;
    expect(info).toMatchObject({ format: 1, channels: 1, sampleRate: 16000, bitsPerSample: 16 });
    const samples = new Int16Array(info.data.slice().buffer);
    expect([...samples]).toEqual([0, 16383, -16384, 32767, -32768]);
  });
  it("refuses bytes that are not a RIFF/WAVE file", () => {
    expect(readWav(new Uint8Array(ascii("OggS\0\0\0\0WAVE")))).toBeNull();
    expect(readWav(new Uint8Array(4))).toBeNull();
  });
  it("skips other chunks, honours odd-size padding and clamps an oversized data size", () => {
    const wav = encodeWav(new Float32Array([0.25, -0.25]), 24000);
    const extra = [...ascii("LIST"), 3, 0, 0, 0, 1, 2, 3, 0];
    const bytes = new Uint8Array([...wav.subarray(0, 36), ...extra, ...wav.subarray(36)]);
    new DataView(bytes.buffer).setUint32(36 + extra.length + 4, 0xffffffff, true);
    const info = readWav(bytes)!;
    expect(info.sampleRate).toBe(24000);
    expect(info.data.length).toBe(4);
  });
  it("splits on sample boundaries into valid WAV files that cover every sample", () => {
    const wav = encodeWav(new Float32Array(25).fill(0.1), 10);
    const parts = splitWav(readWav(wav)!, 1);
    expect(parts.map((part) => readWav(part)!.data.length)).toEqual([20, 20, 10]);
    for (const part of parts) expect(readWav(part)).toMatchObject({ sampleRate: 10, channels: 1 });
    expect(parts.flatMap((part) => [...readWav(part)!.data])).toEqual([...readWav(wav)!.data]);
  });
});
