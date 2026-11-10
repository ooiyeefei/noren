/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiActions from "../aiActions.js";
import type * as aiRequests from "../aiRequests.js";
import type * as audio from "../audio.js";
import type * as chains from "../chains.js";
import type * as checks from "../checks.js";
import type * as claims from "../claims.js";
import type * as collection from "../collection.js";
import type * as connector from "../connector.js";
import type * as crons from "../crons.js";
import type * as ids from "../ids.js";
import type * as interviews from "../interviews.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_claimEffects from "../lib/claimEffects.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_foundPosts from "../lib/foundPosts.js";
import type * as lib_gate from "../lib/gate.js";
import type * as lib_liveStory from "../lib/liveStory.js";
import type * as lib_mapCopies from "../lib/mapCopies.js";
import type * as lib_mock from "../lib/mock.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_region from "../lib/region.js";
import type * as lib_rules_claims from "../lib/rules/claims.js";
import type * as lib_rules_community from "../lib/rules/community.js";
import type * as lib_rules_index from "../lib/rules/index.js";
import type * as lib_rules_interviews from "../lib/rules/interviews.js";
import type * as lib_rules_mapCopies from "../lib/rules/mapCopies.js";
import type * as lib_rules_pages from "../lib/rules/pages.js";
import type * as lib_rules_places from "../lib/rules/places.js";
import type * as lib_rules_shared from "../lib/rules/shared.js";
import type * as lib_rules_storyFinder from "../lib/rules/storyFinder.js";
import type * as lib_slug from "../lib/slug.js";
import type * as lib_storyPhotos from "../lib/storyPhotos.js";
import type * as lib_translationChecks from "../lib/translationChecks.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_visibility from "../lib/visibility.js";
import type * as linkRead from "../linkRead.js";
import type * as links from "../links.js";
import type * as mapCopies from "../mapCopies.js";
import type * as missions from "../missions.js";
import type * as openText from "../openText.js";
import type * as osmSeed from "../osmSeed.js";
import type * as overtureSeed from "../overtureSeed.js";
import type * as pages from "../pages.js";
import type * as people from "../people.js";
import type * as placeStories from "../placeStories.js";
import type * as placeStoryActions from "../placeStoryActions.js";
import type * as places from "../places.js";
import type * as seed from "../seed.js";
import type * as sourceChecks from "../sourceChecks.js";
import type * as sources from "../sources.js";
import type * as stampBook from "../stampBook.js";
import type * as stewardPeople from "../stewardPeople.js";
import type * as stories from "../stories.js";
import type * as storyConnector from "../storyConnector.js";
import type * as storyFinder from "../storyFinder.js";
import type * as storyFinderActions from "../storyFinderActions.js";
import type * as storyPhotoActions from "../storyPhotoActions.js";
import type * as storyPhotos from "../storyPhotos.js";
import type * as storyShare from "../storyShare.js";
import type * as storyVoice from "../storyVoice.js";
import type * as tables_collection from "../tables/collection.js";
import type * as tables_community from "../tables/community.js";
import type * as tables_connector from "../tables/connector.js";
import type * as tables_interviews from "../tables/interviews.js";
import type * as tables_places from "../tables/places.js";
import type * as tables_storyFinder from "../tables/storyFinder.js";
import type * as tables_storyPhotos from "../tables/storyPhotos.js";
import type * as tables_storyVoice from "../tables/storyVoice.js";
import type * as takedown from "../takedown.js";
import type * as trail from "../trail.js";
import type * as translationChecks from "../translationChecks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiActions: typeof aiActions;
  aiRequests: typeof aiRequests;
  audio: typeof audio;
  chains: typeof chains;
  checks: typeof checks;
  claims: typeof claims;
  collection: typeof collection;
  connector: typeof connector;
  crons: typeof crons;
  ids: typeof ids;
  interviews: typeof interviews;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/claimEffects": typeof lib_claimEffects;
  "lib/errors": typeof lib_errors;
  "lib/foundPosts": typeof lib_foundPosts;
  "lib/gate": typeof lib_gate;
  "lib/liveStory": typeof lib_liveStory;
  "lib/mapCopies": typeof lib_mapCopies;
  "lib/mock": typeof lib_mock;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/region": typeof lib_region;
  "lib/rules/claims": typeof lib_rules_claims;
  "lib/rules/community": typeof lib_rules_community;
  "lib/rules/index": typeof lib_rules_index;
  "lib/rules/interviews": typeof lib_rules_interviews;
  "lib/rules/mapCopies": typeof lib_rules_mapCopies;
  "lib/rules/pages": typeof lib_rules_pages;
  "lib/rules/places": typeof lib_rules_places;
  "lib/rules/shared": typeof lib_rules_shared;
  "lib/rules/storyFinder": typeof lib_rules_storyFinder;
  "lib/slug": typeof lib_slug;
  "lib/storyPhotos": typeof lib_storyPhotos;
  "lib/translationChecks": typeof lib_translationChecks;
  "lib/validators": typeof lib_validators;
  "lib/visibility": typeof lib_visibility;
  linkRead: typeof linkRead;
  links: typeof links;
  mapCopies: typeof mapCopies;
  missions: typeof missions;
  openText: typeof openText;
  osmSeed: typeof osmSeed;
  overtureSeed: typeof overtureSeed;
  pages: typeof pages;
  people: typeof people;
  placeStories: typeof placeStories;
  placeStoryActions: typeof placeStoryActions;
  places: typeof places;
  seed: typeof seed;
  sourceChecks: typeof sourceChecks;
  sources: typeof sources;
  stampBook: typeof stampBook;
  stewardPeople: typeof stewardPeople;
  stories: typeof stories;
  storyConnector: typeof storyConnector;
  storyFinder: typeof storyFinder;
  storyFinderActions: typeof storyFinderActions;
  storyPhotoActions: typeof storyPhotoActions;
  storyPhotos: typeof storyPhotos;
  storyShare: typeof storyShare;
  storyVoice: typeof storyVoice;
  "tables/collection": typeof tables_collection;
  "tables/community": typeof tables_community;
  "tables/connector": typeof tables_connector;
  "tables/interviews": typeof tables_interviews;
  "tables/places": typeof tables_places;
  "tables/storyFinder": typeof tables_storyFinder;
  "tables/storyPhotos": typeof tables_storyPhotos;
  "tables/storyVoice": typeof tables_storyVoice;
  takedown: typeof takedown;
  trail: typeof trail;
  translationChecks: typeof translationChecks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
