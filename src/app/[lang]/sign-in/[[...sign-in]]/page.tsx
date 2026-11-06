import { SignIn } from "@clerk/nextjs";
import { lang } from "next/root-params";
import { Suspense } from "react";
import { activeRegionConfig } from "@/lib/region/registry";

// The form links to sign-up only while accounts are open (FR-125). While they are invite-only there is
// no sign-up page to link to (FR-021).
export default async function SignInPage() {
  const locale = await lang();
  const signUpUrl = activeRegionConfig().legal.accountsOpen ? `/${locale}/sign-up` : undefined;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense>
        <SignIn
          path={`/${locale}/sign-in`}
          signUpUrl={signUpUrl}
          fallbackRedirectUrl={`/${locale}`}
        />
      </Suspense>
    </main>
  );
}
