import { format } from "../i18n";
import { badgeMessages } from "../i18n/messages/badges";
import { placePageMessages } from "../i18n/messages/place-page";
import { connectorMayShareMemberPost, connectorMayShareStory } from "./policy";
import {
  DEMO_LABEL,
  DEMO_NOTE,
  dayOf,
  neighbourhoodLabel,
  neighbourhoodOfPin,
  placeRow,
  type Bilingual,
} from "./present";
import type { PlaceBundle, ToolContext } from "./types";
import { collectionUrl, placeUrl, writeStoryUrl, type UrlLanguage } from "./urls";

// get_place: one place the way a signed-out visitor reads its page, and no more. The Convex
// queries behind PlaceBundle are the ones the page calls, with no sign-in, so a draft, a hidden
// post or anything gated by the launch rules never reaches this file. What this file adds is the
// connector's own rule for member stories (./policy.ts) and the labels Noren puts on its pages.

const MACHINE_TRANSLATION = badgeMessages.en.machineTranslation;
const HUMAN_TRANSLATION = "Translation confirmed by a person";

/** The label Noren puts on a story its AI stitched from public posts, in both languages. */
export function stitchedLabel(postsRead: number): Bilingual {
  const count = String(postsRead);
  return {
    en: format(placePageMessages.en.agentStoryLabel, { count }),
    ja: format(placePageMessages.ja.agentStoryLabel, { count }),
  };
}

function translationLabel(origin: "machine" | "human"): string {
  return origin === "human" ? HUMAN_TRANSLATION : MACHINE_TRANSLATION;
}

export function buildPlace(bundle: PlaceBundle, ctx: ToolContext, language: UrlLanguage) {
  const { place, page, placeStory } = bundle;
  const { region, origin, options } = ctx;
  const offset = region.collection.utcOffsetHours;
  const url = placeUrl(origin, language, place.slug);
  const hasStory = bundle.stories.length > 0 || placeHasPeopleSources(bundle) || page !== null;
  const row = placeRow({ ...place, hasStory }, neighbourhoodOfPin(region, place.pin), {
    region,
    origin,
    language,
  });

  // Cautions come from the owner's confirmed, published statements, labelled with the region's
  // fixed vocabulary. The labels are Noren's own wording and say when no Japanese speaker has
  // reviewed them yet.
  const claims = page?.claims ?? [];
  const cautions = claims
    .filter((claim) => claim.kind === "caution")
    .map((claim) => {
      const known = region.cautionVocabulary.find((c) => c.key === claim.cautionType);
      return {
        key: claim.cautionType ?? null,
        label:
          known === undefined
            ? null
            : { en: known.labels.en ?? known.key, ja: known.labels.ja ?? known.key },
        labelReviewedByJapaneseSpeaker: known?.labelsReviewedBy != null,
        ownerWords: { text: claim.textOriginal, language: claim.langOriginal },
        ...(claim.isMock ? { demo: DEMO_LABEL } : {}),
      };
    });

  const ownerStatements = claims
    .filter((claim) => claim.kind !== "caution")
    .map((claim) => ({
      kind: claim.kind,
      text: claim.textOriginal,
      language: claim.langOriginal,
      from:
        claim.origin === "interview"
          ? "an interview with the place"
          : claim.origin === "creator_note"
            ? "a note by a Noren creator"
            : "open text under its own licence",
      translations: claim.translations.map((t) => ({
        language: t.lang,
        text: t.text,
        label: translationLabel(t.origin),
      })),
      ...(claim.aiAssisted ? { aiAssisted: "Written with help from AI" } : {}),
      ...(claim.status === "disputed" ? { disputed: true } : {}),
      ...(claim.openText
        ? {
            credit: {
              attribution: claim.openText.attribution,
              licence: claim.openText.licence,
              source: claim.openText.sourceUrl,
            },
          }
        : {}),
      ...(claim.isMock ? { demo: DEMO_LABEL } : {}),
    }));

  // Member-written stories. The policy decides, per story, whether its words and the writer's name
  // go out. A story that is held back is counted, never quoted.
  const allowed = bundle.stories.filter((story) => connectorMayShareStory(story, options));
  const memberStories = allowed.map((story) => ({
    writer: story.authorName,
    language: story.lang,
    text: story.body,
    writtenOn: dayOf(story.addedAt, offset),
    ...(story.photos.length > 0
      ? {
          photos: {
            count: story.photos.length,
            credit: `Photo${story.photos.length > 1 ? "s" : ""} by ${story.authorName}`,
          },
        }
      : {}),
    ...(story.isMock ? { demo: DEMO_LABEL } : {}),
  }));
  const withheldStories = bundle.stories.length - allowed.length;

  const memberPosts = bundle.sources.filter((source) => source.foundInPublicPost !== true);
  const mayShareMemberPosts = connectorMayShareMemberPost(options);
  const withheldPosts = mayShareMemberPosts ? 0 : memberPosts.length;
  const sharedPosts = mayShareMemberPosts
    ? memberPosts.map((source) => ({
        sharedBy: source.sharedBy ?? null,
        note: source.creatorNote ?? null,
        noteLanguage: source.noteLang ?? null,
        platform: source.platform,
        link: source.canonicalUrl,
        ...(source.isMock ? { demo: DEMO_LABEL } : {}),
      }))
    : [];
  const withheld = withheldStories + withheldPosts;

  // Public posts the story finder found: a short word-for-word quote, the author as the platform
  // shows them, and a link to the original. Their translations are machine translations.
  const foundPosts = bundle.sources
    .filter((source) => source.foundInPublicPost === true)
    .map((source) => ({
      kind: source.foundKind ?? "story",
      ...(source.excerpt === undefined
        ? {}
        : { quote: source.excerpt, quoteLanguage: source.excerptLang ?? null }),
      ...(source.excerptTranslations && source.excerptTranslations.length > 0
        ? {
            translations: source.excerptTranslations.map((t) => ({
              language: t.lang,
              text: t.text,
              label: MACHINE_TRANSLATION,
            })),
          }
        : {}),
      author: source.authorHandle ?? null,
      platform: source.platform,
      link: source.canonicalUrl,
      ...(source.postedAt === undefined ? {} : { postedOn: dayOf(source.postedAt, offset) }),
      foundBy: "Found by Noren in a public post",
      ...(source.isMock ? { demo: DEMO_LABEL } : {}),
    }));

  const stitchedStory =
    placeStory === null
      ? null
      : {
          label: stitchedLabel(placeStory.postsRead),
          sentences: placeStory.sentences.map((sentence) => ({
            en: sentence.en,
            ja: sentence.ja,
            sources: sentence.notes.map((note) => note + 1),
          })),
          sources: placeStory.notes.map((note, index) => ({
            number: index + 1,
            words: note.words,
            language: note.lang ?? null,
            platform: note.platform ?? null,
            author: note.authorHandle ?? null,
            link: note.canonicalUrl,
            ...(note.postedAt === undefined ? {} : { postedOn: dayOf(note.postedAt, offset) }),
          })),
        };

  const credits = [
    ...place.dataSources
      .filter((source) => source.attribution)
      .map((source) => ({
        for: "Place details",
        credit: source.attribution!,
        ...(source.licence ? { licence: source.licence } : {}),
      })),
    ...memberStories.flatMap((story) =>
      story.photos ? [{ for: "Story photos", credit: story.photos.credit }] : [],
    ),
  ];

  const set = bundle.set;
  return {
    place: {
      ...row,
      writeAStoryUrl: writeStoryUrl(origin, language, place.slug),
      ...(row.demo ? { demoNote: DEMO_NOTE } : {}),
      ...(set === null
        ? {}
        : {
            stampCollection: {
              name: set.setNames as Bilingual,
              neighbourhood: neighbourhoodLabel(region, set.neighbourhoodId),
              url: collectionUrl(origin, language, set.neighbourhoodId),
            },
          }),
    },
    cautions,
    ownerStatements,
    memberStories: {
      total: bundle.stories.length,
      stories: memberStories,
      ...(withheld > 0
        ? {
            heldBack: withheld,
            readOnNoren: `Read the member stories on Noren: ${url}`,
            note: "These members have not allowed Noren to hand their words to AI assistants, so only a count is given. Do not guess or paraphrase what they wrote.",
          }
        : {}),
      ...(sharedPosts.length > 0 ? { sharedPosts } : {}),
    },
    stitchedStory,
    foundPosts,
    credits,
  };
}

/** A member's shared post counts as a story to read, as the map's dot treats it. */
function placeHasPeopleSources(bundle: PlaceBundle): boolean {
  return bundle.sources.length > 0;
}
