import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CardFont } from "./render";

const FONT_DIR = path.join(process.cwd(), "src/lib/share/fonts");

/** The Japanese-capable font the picture is drawn with, read from the repository. Server only. */
export async function loadCardFonts(): Promise<CardFont[]> {
  const read = async (file: string) => {
    const bytes = await readFile(path.join(FONT_DIR, file));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  };
  return [
    { name: "BIZ UDPGothic", data: await read("BIZUDPGothic-Regular.ttf"), weight: 400 },
    { name: "BIZ UDPGothic", data: await read("BIZUDPGothic-Bold.ttf"), weight: 700 },
  ];
}
