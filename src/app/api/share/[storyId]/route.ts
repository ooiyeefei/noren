import { fetchQuery } from "convex/nextjs";
import { jsonError } from "@/lib/http/handler";
import { isCardSize, cardFileName, type CardSize } from "@/lib/share/card";
import { loadCardFonts } from "@/lib/share/fonts";
import { renderCard } from "@/lib/share/render";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/**
 * A picture of one live story: its words, the place in English with Japanese beside, the writer's
 * name and the site. It never carries a story's photo, which may show faces. It is drawn on the server with next/og so
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
  const image = renderCard(
    {
      body: card.body,
      authorName: card.authorName,
      placeEnglish: card.placeEnglish,
      placeJapanese: card.placeJapanese,
      cutNote:
        card.lang === "ja" ? "全文は noren.yooi.me で読めます" : "Read it all on noren.yooi.me",
    },
    size,
    await loadCardFonts(),
  );
  const headers = new Headers(image.headers);
  // A removal should show up soon: keep a copy for minutes, not days.
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  if (url.searchParams.get("download") === "1")
    headers.set("Content-Disposition", `attachment; filename="${cardFileName(size)}"`);
  return new Response(image.body, { status: 200, headers });
}
