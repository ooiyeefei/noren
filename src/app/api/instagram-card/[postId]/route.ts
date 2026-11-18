import { fetchQuery } from "convex/nextjs";
import sharp from "sharp";
import { jsonError } from "@/lib/http/handler";
import { loadCardFonts } from "@/lib/share/fonts";
import { renderCard } from "@/lib/share/render";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

/**
 * The picture Instagram's servers fetch when Noren posts a story there: the 1080 x 1350 (4:5) feed
 * card, as a JPEG, because Instagram takes JPEG only. The address carries a secret made for this one
 * post. It answers only while that post is queued or being sent and its story is still shown with the
 * writer's tick on; otherwise 404. It draws what the share kit's picture draws (words, place, name,
 * site) and never a photo. Not cached, so a withdrawal takes effect at once.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ postId: string }> },
): Promise<Response> {
  const { postId } = await context.params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  let card;
  try {
    card = await fetchQuery(api.instagramPosts.cardForPost, {
      postId: postId as Id<"instagramPost">,
      token,
    });
  } catch (caught) {
    // A malformed address is the only throw expected here; anything else is ours to hear about.
    const name = caught instanceof Error ? caught.name : typeof caught;
    if (
      !/ArgumentValidation/i.test(name) &&
      !/ArgumentValidation|invalid.*id/i.test(String(caught))
    )
      console.error(`instagram card: query failed (${name})`);
    return jsonError("not_found", "no picture");
  }
  if (card === null) return jsonError("not_found", "no picture");
  const png = await renderCard(
    {
      body: card.body,
      authorName: card.authorName,
      placeEnglish: card.placeEnglish,
      placeJapanese: card.placeJapanese,
      cutNote:
        card.lang === "ja" ? "全文は noren.yooi.me で読めます" : "Read it all on noren.yooi.me",
    },
    "feed",
    await loadCardFonts(),
  ).arrayBuffer();
  const jpeg = await sharp(Buffer.from(png))
    .flatten({ background: "#f7f4ec" })
    .toColourspace("srgb")
    .jpeg({ quality: 90 })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
