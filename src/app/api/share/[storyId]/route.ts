import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchQuery } from "convex/nextjs";
import { jsonError } from "@/lib/http/handler";
import { publicPhotoProps, photoUrl } from "@/lib/photos/settings";
import { getActiveRegion } from "@/lib/region";
import { isCardSize, cardFileName, type CardSize } from "@/lib/share/card";
import { renderCard, type CardFont } from "@/lib/share/render";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const FONT_DIR = path.join(process.cwd(), "src/lib/share/fonts");
const PHOTO_WAIT_MS = 5000;
const PHOTO_BYTES = 8_000_000;

async function loadFonts(): Promise<CardFont[]> {
  const read = async (file: string) => {
    const bytes = await readFile(path.join(FONT_DIR, file));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  };
  return [
    { name: "BIZ UDPGothic", data: await read("BIZUDPGothic-Regular.ttf"), weight: 400 },
    { name: "BIZ UDPGothic", data: await read("BIZUDPGothic-Bold.ttf"), weight: 700 },
  ];
}

/** The photo as a data address, or null when it can't be had: a card without a photo is still a card. */
async function loadPhoto(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_WAIT_MS) });
    const type = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (!response.ok || (type !== "image/jpeg" && type !== "image/png")) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > PHOTO_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch (caught) {
    console.warn(
      `share card: photo not loaded (${caught instanceof Error ? caught.name : typeof caught})`,
    );
    return null;
  }
}

/**
 * A picture of one live story: its words, the place in English with Japanese beside, the first
 * photo if it has one, the writer's name and the site. It is drawn on the server with next/og so
 * the same Japanese font renders on every phone. Anything not shown on its place's page, a hidden
 * or removed story among them, has no picture.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ storyId: string }> },
): Promise<Response> {
  const { storyId } = await context.params;
  const url = new URL(request.url);
  const sizeParam = url.searchParams.get("size") ?? "story";
  if (!isCardSize(sizeParam)) return jsonError("invalid_input", "size is story or feed");
  const size: CardSize = sizeParam;
  let card;
  try {
    card = await fetchQuery(api.storyShare.card, { storyId: storyId as Id<"story"> });
  } catch (caught) {
    // A malformed address is the only throw expected here; anything else is ours to hear about.
    const name = caught instanceof Error ? caught.name : typeof caught;
    if (
      !/ArgumentValidation/i.test(name) &&
      !/ArgumentValidation|invalid.*id/i.test(String(caught))
    )
      console.error(`share card: query failed (${name})`);
    return jsonError("not_found", "no picture for this story");
  }
  if (card === null) return jsonError("not_found", "no picture for this story");
  const region = getActiveRegion();
  const photoBase = publicPhotoProps(region, process.env)?.baseUrl;
  const photo =
    card.photoKey && photoBase ? await loadPhoto(photoUrl(photoBase, card.photoKey)) : null;
  const image = renderCard(
    {
      body: card.body,
      authorName: card.authorName,
      placeEnglish: card.placeEnglish,
      placeJapanese: card.placeJapanese,
      photo,
      cutNote:
        card.lang === "ja" ? "全文は noren.yooi.me で読めます" : "Read it all on noren.yooi.me",
    },
    size,
    await loadFonts(),
  );
  const headers = new Headers(image.headers);
  // A removal should show up soon: keep a copy for minutes, not days.
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  if (url.searchParams.get("download") === "1")
    headers.set("Content-Disposition", `attachment; filename="${cardFileName(size)}"`);
  return new Response(image.body, { status: 200, headers });
}
