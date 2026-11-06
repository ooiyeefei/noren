import { SignUp } from "@clerk/nextjs";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { Suspense } from "react";
import { activeRegionConfig } from "@/lib/region/registry";

// Clerk's own form, with its tick for the minimum age and the documents (research R9). The page does
// not exist while accounts are invite-only (FR-021, FR-125).
export default async function SignUpPage() {
  if (!activeRegionConfig().legal.accountsOpen) notFound();
  const locale = await lang();
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center p-6">
      <Suspense>
        <SignUp
          path={`/${locale}/sign-up`}
          signInUrl={`/${locale}/sign-in`}
          fallbackRedirectUrl={`/${locale}`}
        />
      </Suspense>
    </main>
  );
}
