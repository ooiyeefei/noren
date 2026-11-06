"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { ShownAsActions } from "./shown-as";

/**
 * What the "Shown as" control needs, or undefined when there is nothing to ask. Only a clear false
 * counts, so a page newer than the server asks nothing and blocks nobody.
 */
export function useShownAs(
  person: { displayName: string; nameConfirmed?: boolean } | null | undefined,
): ShownAsActions | undefined {
  const confirm = useMutation(api.people.confirmMyDisplayName);
  const save = useMutation(api.people.setMyDisplayName);
  if (person?.nameConfirmed !== false) return undefined;
  return {
    displayName: person.displayName,
    confirm: () => confirm({}),
    save: (displayName) => save({ displayName }),
  };
}
