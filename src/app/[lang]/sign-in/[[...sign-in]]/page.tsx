import { SignIn } from "@clerk/nextjs";
import { lang } from "next/root-params";
import { Suspense } from "react";

// There is no public sign-up page: accounts are invite-only (FR-021).
export default async function SignInPage() {
  const locale = await lang();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense>
        <SignIn path={`/${locale}/sign-in`} fallbackRedirectUrl={`/${locale}`} />
      </Suspense>
    </main>
  );
}
