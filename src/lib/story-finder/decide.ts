import { z } from "zod";
import {
  ABOUT_ANSWERS,
  capQuote,
  contactIn,
  EVIDENCE_MAX,
  isVerbatim,
  MENTION_KINDS,
  namesPlace,
  normaliseWhitespace,
  postHasAdMarker,
  type MentionKind,
  type RejectReason,
} from "./mention";

/**
 * What the model reports about one post, through the report_mention tool. Parsed strictly: an extra
 * field, a wrong type or an overlong value fails the parse, and the post is not judged at all.
 */
export const reportMentionSchema = z.strictObject({
  aboutThisPlace: z
    .enum(ABOUT_ANSWERS)
    .describe(
      "yes only when the post clearly talks about this place, by its name or an unmistakable reference; no when it is about something else; unsure otherwise.",
    ),
  evidence: z
    .string()
    .max(1000)
    .describe(
      "The shortest words, copied character for character from the post's text, title or location tag, that show it is about this place. Empty when there are none.",
    ),
  kind: z
    .enum(MENTION_KINDS)
    .describe(
      "story: the place's history, its people, how it came to be or how things are done there. tip: useful firsthand practical detail for a visitor. rating_only: praise, complaints or scores without a story or practical detail. ad_or_sponsored: an advert, sponsored or PR post, affiliate link, campaign or sale. unrelated: not about the place.",
    ),
  namesPrivatePeople: z
    .boolean()
    .describe(
      "true when the post names a private person (a name or a handle of someone other than the post's author), other than the place's own public business name or staff the business names in its own posts.",
    ),
  quote: z
    .string()
    .max(2000)
    .describe(
      "The one passage, at most 280 characters, copied character for character from the post, that carries the story or tip. No translation, corrections, ellipses or joined parts. Empty unless kind is story or tip.",
    ),
  topics: z
    .array(z.string().max(80))
    .max(10)
    .describe("Up to 5 short English topic words, such as history, founder, craft, menu."),
});
export type ReportedMention = z.infer<typeof reportMentionSchema>;

export type StoredVerdict = {
  aboutThisPlace: (typeof ABOUT_ANSWERS)[number];
  evidence: string;
  kind: MentionKind;
  namesPrivatePeople: boolean;
  quote: string;
  topics: string[];
  /** Set when code found an advertising label the model did not report. */
  adMarker?: boolean;
};

export type MentionDecision =
  | { status: "accepted"; verdict: StoredVerdict; quote: string }
  | { status: "rejected"; reason: RejectReason; verdict: StoredVerdict };

/** The post as the check sees it. Everything here is the post's own, untrusted. */
export type CheckedPost = {
  text: string;
  /** A web page's or Reddit post's title. */
  title?: string;
  /** The place the post is tagged with (Google's name for the place, an Instagram location). */
  locationName?: string;
  /**
   * Set by the collector when the whole post, before its text was cut to the stored window, carried
   * an ad label. The text here may be only that window, which can leave the label out.
   */
  adMarker?: boolean;
};

/** The post's text with its title and location tag: where its words about the place may be. */
export function postContext(post: CheckedPost): string {
  return [post.text, post.title, post.locationName].filter(Boolean).join("\n");
}

/**
 * Code checks what the model claims (Meta's "verifiable agents"): the evidence must be in the post
 * (its text, title or location tag) and the quote in its text, word for word apart from whitespace,
 * or nothing the model said is trusted. Then checks that need no model: the post names the place
 * (one of `placeNames`, in any language or script) and carries no advert label, whether found in
 * the stored text or flagged by the collector on the whole page. Then the model's
 * rules: about this place, a story or a tip, no private person named. Last, the quote that would be
 * shown must fit and carry no address, email, phone number or handle.
 */
export function decideMention(
  post: CheckedPost,
  placeNames: readonly string[],
  reported: ReportedMention,
): MentionDecision {
  const text = post.text;
  const evidence = normaliseWhitespace(reported.evidence);
  const quote = normaliseWhitespace(reported.quote);
  const adMarker = postHasAdMarker(post);
  const verdict: StoredVerdict = {
    aboutThisPlace: reported.aboutThisPlace,
    evidence: evidence.slice(0, EVIDENCE_MAX),
    kind: reported.kind,
    namesPrivatePeople: reported.namesPrivatePeople,
    quote,
    topics: reported.topics
      .map((topic) => normaliseWhitespace(topic).toLowerCase().slice(0, 40))
      .filter(Boolean)
      .slice(0, 5),
    ...(adMarker ? { adMarker } : {}),
  };
  const reject = (reason: RejectReason): MentionDecision => ({
    status: "rejected",
    reason,
    verdict,
  });
  if ((evidence && !isVerbatim(postContext(post), evidence)) || (quote && !isVerbatim(text, quote)))
    return reject("unverifiable");
  if (!namesPlace(postContext(post), placeNames)) return reject("place_not_named");
  if (adMarker || reported.kind === "ad_or_sponsored") return reject("sponsored");
  if (reported.aboutThisPlace === "no") return reject("not_about_place");
  if (reported.aboutThisPlace === "unsure") return reject("unsure_about_place");
  if (reported.kind === "rating_only") return reject("rating_only");
  if (reported.kind === "unrelated") return reject("unrelated");
  if (reported.namesPrivatePeople) return reject("names_private_people");
  if (!evidence) return reject("no_evidence");
  if (!quote) return reject("no_quote");
  const capped = capQuote(quote);
  if (capped === null) return reject("quote_too_long");
  if (contactIn(capped) !== null) return reject("quote_has_contact");
  return { status: "accepted", verdict: { ...verdict, quote: capped }, quote: capped };
}
