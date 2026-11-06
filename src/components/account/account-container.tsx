"use client";

import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import type { AccountState } from "@/components/layout/account-menu";
import { localePath, type Locale } from "@/lib/i18n";
import { api } from "../../../convex/_generated/api";
import { AccountView, errorDetail, requestDeletion } from "./account-view";

export function AccountContainer({
  locale,
  nameSection,
}: {
  locale: Locale;
  nameSection?: React.ReactNode;
}): React.JSX.Element {
  const { signOut } = useClerk();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const state: AccountState = isLoading
    ? { kind: "loading" }
    : !isAuthenticated
      ? { kind: "signedOut" }
      : person == null
        ? { kind: "settingUp" }
        : { kind: "signedIn", ...person };
  async function leave() {
    const welcome = localePath(locale, "/welcome");
    try {
      await signOut({ redirectUrl: welcome });
    } catch (error) {
      // The Clerk user has just gone, so its session may already be gone with it.
      console.error(`sign-out after account deletion failed (${errorDetail(error)})`);
    }
    window.location.assign(welcome);
  }
  return (
    <AccountView
      locale={locale}
      state={state}
      nameSection={nameSection}
      actions={{ deleteAccount: () => requestDeletion(), leave }}
    />
  );
}
