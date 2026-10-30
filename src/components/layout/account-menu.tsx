"use client";

import { SignOutButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Role } from "@/lib/domain/constants";
import { localePath, messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { api } from "../../../convex/_generated/api";

export type AccountState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "settingUp" }
  | { kind: "signedIn"; displayName: string; role: Role; isMock: boolean };

export function accountInitials(displayName: string): string {
  const name = displayName.replace(/\([^)]*\)/g, "").trim();
  if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(name)) {
    return Array.from(name)[0] ?? "";
  }
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase();
}

export function AccountMenuView({
  locale,
  state,
  signOut,
  pathname,
}: {
  locale: Locale;
  state: AccountState;
  signOut?: React.ReactNode;
  pathname?: string | null;
}): React.JSX.Element | null {
  const m = messagesFor(shellMessages, locale);
  if (state.kind === "signedOut") {
    const signInPath = localePath(locale, "/sign-in");
    if (pathname === signInPath || pathname?.startsWith(`${signInPath}/`)) return null;
    return (
      <Link
        href={localePath(locale, "/sign-in")}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[10px] border border-input px-2 text-xs whitespace-nowrap text-kon hover:bg-kamenozoki sm:px-3 sm:text-sm"
      >
        {m.signIn}
      </Link>
    );
  }
  if (state.kind === "loading" || state.kind === "settingUp")
    return (
      <div
        role="status"
        aria-label={state.kind === "loading" ? m.signingIn : m.settingUp}
        className="flex size-11 shrink-0 items-center justify-center"
      >
        <Skeleton className="size-10 rounded-full" />
      </div>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={m.accountMenu}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-kon text-sm font-bold text-white">
            {accountInitials(state.displayName)}
          </span>
          <span className="hidden max-w-48 truncate text-sm lg:inline">{state.displayName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="font-bold">{state.displayName}</div>
          <div className="text-muted-foreground">{m[state.role]}</div>
          {state.isMock && (
            <div data-badge="demo" className="text-muted-foreground">
              {m.demoAccount}
            </div>
          )}
        </DropdownMenuLabel>
        {(state.role === "creator" || state.role === "steward") && (
          <DropdownMenuItem asChild>
            <Link href={localePath(locale, "/creator")}>{m.creatorPages}</Link>
          </DropdownMenuItem>
        )}
        {state.role === "business_owner" && (
          <DropdownMenuItem asChild>
            <Link href={localePath(locale, "/owner")}>{m.ownerPages}</Link>
          </DropdownMenuItem>
        )}
        {state.role === "steward" && (
          <DropdownMenuItem asChild>
            <Link href={localePath(locale, "/steward")}>{m.stewardPages}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={localePath(locale)}>{m.exploreMap}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {signOut ?? <button type="button">{m.signOut}</button>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountMenu({ locale }: { locale: Locale }): React.JSX.Element {
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const ensureCurrent = useMutation(api.people.ensureCurrent);
  const ensured = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) {
      ensured.current = false;
      return;
    }
    if (ensured.current) return;
    ensured.current = true;
    ensureCurrent().catch((error: unknown) => {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`people.ensureCurrent failed (${detail})`);
    });
  }, [isAuthenticated, ensureCurrent]);
  const state: AccountState = isLoading
    ? { kind: "loading" }
    : !isAuthenticated
      ? { kind: "signedOut" }
      : person == null
        ? { kind: "settingUp" }
        : { kind: "signedIn", ...person };
  return (
    <AccountMenuView
      locale={locale}
      state={state}
      pathname={pathname}
      signOut={
        <SignOutButton>
          <button type="button">{messagesFor(shellMessages, locale).signOut}</button>
        </SignOutButton>
      }
    />
  );
}
