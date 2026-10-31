import type { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../../_generated/dataModel";
import { registerClaimRules } from "./claims";
import { registerCommunityRules } from "./community";
import { registerInterviewRules } from "./interviews";
import { registerMapCopyRules } from "./mapCopies";
import { registerPageRules } from "./pages";
import { registerPlaceRules } from "./places";

/** Registers every rule in specs/001-noren-mvp/data-model.md that a validator cannot express. */
export function registerRules(triggers: Triggers<DataModel>) {
  registerPlaceRules(triggers);
  registerInterviewRules(triggers);
  registerClaimRules(triggers);
  registerPageRules(triggers);
  registerCommunityRules(triggers);
  registerMapCopyRules(triggers);
}
