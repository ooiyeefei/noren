// Shared fixtures for the public UI tests (home, place page, notice). Read-only for UI packages:
// a package that needs other data defines it in its own test file.
import {
  publicRegionProps,
  type PageViewLike,
  type PlaceDetailLike,
  type SourceViewLike,
} from "@/components/public/mapping";
import { regionSchema } from "@/lib/region/schema";
import regionJson from "../../regions/nagasaki.json";

export const config = regionSchema.parse(regionJson);
export const region = publicRegionProps(config, "ja");
export const place: PlaceDetailLike = {
  dataSources: [],
  category: "cafe",
  _id: "demo",
  regionId: config.id,
  slug: "demo-cafe",
  kind: "business",
  visibility: "demo_public",
  isMock: true,
  names: [
    { lang: "ja", script: "kanji", value: "デモ喫茶", isPrimary: true },
    { lang: "en", script: "latin", value: "Demo Cafe", isPrimary: true },
  ],
  pin: { lat: 32.75, lng: 129.88 },
  canEdit: false,
  canManage: false,
  hasOwner: true,
  isOwner: false,
};
export const landmark: PlaceDetailLike = {
  ...place,
  _id: "landmark",
  slug: "demo-landmark",
  visibility: "public",
  isMock: false,
  kind: "landmark",
  names: [{ lang: "en", script: "latin", value: "Demo landmark fixture", isPrimary: true }],
};
export const page: PageViewLike = {
  placeId: place._id,
  version: 1,
  composedAt: 42,
  generatedBy: "demo-model",
  sentences: [
    {
      lang: "ja",
      ordinal: 0,
      text: "架空のお店の話です。",
      textLang: "ja",
      translation: "original",
      claimIds: ["claim"],
    },
    {
      lang: "en",
      ordinal: 0,
      text: "A fictional cafe story.",
      textLang: "en",
      translation: "machine",
      claimIds: ["claim"],
    },
  ],
  claims: [
    {
      _id: "claim",
      kind: "story",
      textOriginal: "架空のお店の話です。",
      langOriginal: "ja",
      origin: "interview",
      status: "disputed",
      disputedWith: "other",
      quote: "架空のお店の話です。",
      confirmedAt: 42,
      aiAssisted: true,
      isMock: true,
      translations: [{ lang: "en", text: "A fictional cafe story.", origin: "machine" }],
    },
    {
      _id: "other",
      kind: "story",
      textOriginal: "別の架空の話です。",
      langOriginal: "ja",
      origin: "interview",
      status: "disputed",
      disputedWith: "claim",
      aiAssisted: false,
      isMock: true,
      translations: [],
    },
    {
      _id: "caution",
      kind: "caution",
      cautionType: config.cautionVocabulary[0]!.key,
      textOriginal: "デモの注意点",
      langOriginal: "ja",
      origin: "interview",
      status: "published",
      aiAssisted: false,
      isMock: true,
      translations: [],
    },
  ],
};
export const sources: SourceViewLike[] = [
  {
    _id: "one",
    platform: "youtube",
    canonicalUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    embed: { kind: "iframe", url: "https://www.youtube-nocookie.com/embed/abcdefghijk" },
    authorHandle: "Demo creator",
    creatorNote: "架空のメモ",
    noteLang: "ja",
    isMock: true,
  },
  {
    _id: "two",
    platform: "instagram",
    canonicalUrl: "https://www.instagram.com/p/demo",
    embed: {
      kind: "blockquote",
      url: "https://www.instagram.com/p/demo",
      scriptUrl: "https://www.instagram.com/embed.js",
    },
    isMock: true,
  },
  {
    _id: "three",
    platform: "web",
    canonicalUrl: "https://example.com",
    embed: { kind: "link", url: "https://example.com" },
    title: "Demo link",
    isMock: true,
  },
];
