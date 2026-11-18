import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchQuery } from "convex/nextjs";
import { placeHeading } from "@/components/public/mapping";
import { jsonError } from "@/lib/http/handler";
import { format, isSupportedLocale, messagesFor } from "@/lib/i18n";
import { postcardMessages } from "@/lib/i18n/messages/postcard";
import { renderPostcardImage } from "@/lib/postcard/og";
import { cardDate, isPostcardCode } from "@/lib/postcard/rules";
import { getActiveRegion } from "@/lib/region";
import { SITE } from "@/lib/share/card";
import type { CardFont } from "@/lib/share/render";
import { api } from "../../../../../../convex/_generated/api";

const FONT_DIR = path.join(process.cwd(), "src/lib/share/fonts");

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

/**
 * The picture a link preview shows for a postcard: names, town and day, and nothing the sender could
 * later take back (src/lib/postcard/og.tsx). No picture for a switched-off feature, a wrong code or a
 * deleted card, and none is ever kept: a deleted card's picture is gone with its link.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;
  if (!isPostcardCode(code)) return jsonError("not_found", "no picture for this postcard");
  const region = getActiveRegion();
  if (!region.features.postcard) return jsonError("not_found", "no picture for this postcard");
  const asked = new URL(request.url).searchParams.get("lang");
  const locale = isSupportedLocale(asked) ? asked : "en";
  let card;
  try {
    card = await fetchQuery(api.postcards.view, { code });
  } catch (caught) {
    console.error(
      `postcard picture: query failed (${caught instanceof Error ? caught.name : typeof caught})`,
    );
    return jsonError("not_found", "no picture for this postcard");
  }
  if (card === null) return jsonError("not_found", "no picture for this postcard");
  const m = messagesFor(postcardMessages, locale);
  const image = renderPostcardImage(
    {
      title: format(m.cardFor, { name: card.recipientName }),
      from: format(m.cardFrom, { name: card.fromName }),
      where:
        `${region.name.en ?? region.id} ${region.name.ja ?? ""} · ${cardDate(card.sentAt, region.collection.utcOffsetHours, locale)}`.replace(
          /\s+·/,
          " ·",
        ),
      places: card.places.map((place) => {
        const heading = placeHeading(place.names, locale, region);
        return { primary: heading.primary.text, secondary: heading.secondary?.text ?? null };
      }),
      site: SITE,
    },
    await loadFonts(),
  );
  const headers = new Headers(image.headers);
  // Never kept by a shared cache: a deleted card's picture must not outlive its link.
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(image.body, { status: 200, headers });
}
