import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { Triggers } from "convex-helpers/server/triggers";
import type { DataModel } from "../_generated/dataModel";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "../_generated/server";
import { registerRules } from "./rules";

/**
 * The write gate. Every mutation in this app is built from `mutation` or `internalMutation` below,
 * so each insert, patch, replace and delete runs the rules in ./rules inside its own transaction
 * and a broken rule aborts the whole mutation. ESLint forbids importing the raw wrappers anywhere
 * else. Writes that bypass this ctx (the dashboard, `convex import`) are not checked.
 */
export const triggers = new Triggers<DataModel>();
registerRules(triggers);

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
