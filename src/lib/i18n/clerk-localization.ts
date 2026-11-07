import { jaJP } from "@clerk/localizations";
import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";
import { format, type Locale } from "./index";
import { legalMessages } from "./messages/legal-documents";

type ClerkLocalization = NonNullable<ComponentProps<typeof ClerkProvider>["localization"]>;

// Clerk's own UI strings; a language without an entry falls back to Clerk's English.
// Clerk's Japanese pack leaves these three strings on the sign-up path in English.
const JA: ClerkLocalization = {
  ...jaJP,
  formFieldInputPlaceholder__signUpPassword: "パスワードを作成",
  unstable__errors: {
    ...jaJP.unstable__errors,
    form_password_matches_identifier:
      "パスワードをメールアドレス、電話番号、ユーザー名と同じにすることはできません。",
    too_many_unverified_identifications:
      "確認待ちのメールアドレスや電話番号が多すぎます。不要なものを削除してから、もう一度お試しください。",
  },
};
const CLERK_LOCALIZATION: Partial<Record<Locale, ClerkLocalization>> = { ja: JA };

/**
 * Clerk's strings for a language, with one tick that also states the minimum age (research R9). Clerk
 * shows this tick before the account exists, on the email path and on the return from Google.
 */
export function clerkLocalization(locale: Locale, minimumAge: number): ClerkLocalization {
  const base = CLERK_LOCALIZATION[locale] ?? {};
  return {
    ...base,
    signUp: {
      ...base.signUp,
      legalConsent: {
        ...base.signUp?.legalConsent,
        checkbox: {
          ...base.signUp?.legalConsent?.checkbox,
          label__termsOfServiceAndPrivacyPolicy: format(legalMessages[locale].consentLabel, {
            age: minimumAge,
          }),
        },
      },
    },
  };
}
