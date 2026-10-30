"use client";

import { useConvexAuth, useQuery } from "convex/react";
import type { Role } from "@/lib/domain/constants";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { api } from "../../../convex/_generated/api";
import { AccountMenuView, type AccountState } from "./account-menu";

export function RequireRoleView({
  locale,
  state,
  roles,
  children,
}: {
  locale: Locale;
  state: AccountState;
  roles: readonly Role[];
  children: React.ReactNode;
}): React.JSX.Element {
  if (state.kind !== "signedIn") return <AccountMenuView locale={locale} state={state} />;
  if (roles.includes(state.role) || (state.role === "steward" && roles.includes("creator")))
    return <>{children}</>;
  const m = messagesFor(shellMessages, locale);
  return (
    <p role="alert">
      {format(m.pageForRoles, {
        roles: roles.map((role) => m[role]).join(locale === "ja" ? "、" : ", "),
      })}
    </p>
  );
}

export function RequireRole(props: {
  locale: Locale;
  roles: readonly Role[];
  children: React.ReactNode;
}): React.JSX.Element {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const state: AccountState = isLoading
    ? { kind: "loading" }
    : !isAuthenticated
      ? { kind: "signedOut" }
      : person == null
        ? { kind: "settingUp" }
        : { kind: "signedIn", ...person };
  return <RequireRoleView {...props} state={state} />;
}
