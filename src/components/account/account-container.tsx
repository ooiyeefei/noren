"use client";

import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { AccountState } from "@/components/layout/account-menu";
import { localePath, type Locale } from "@/lib/i18n";
import { api } from "../../../convex/_generated/api";
import { AccountName } from "./account-name";
import { AccountView, errorDetail, requestDeletion } from "./account-view";

export function AccountContainer({ locale }: { locale: Locale }): React.JSX.Element {
  const { signOut } = useClerk();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const rename = useMutation(api.people.setMyDisplayName);
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
      nameSection={
        // A demo account can't rename itself: the server refuses it.
        person && !person.isMock ? (
          <AccountName
            locale={locale}
            displayName={person.displayName}
            save={(displayName) => rename({ displayName })}
          />
        ) : undefined
      }
      actions={{ deleteAccount: () => requestDeletion(), leave }}
    />
  );
}
