import { Suspense } from "react";
import { RequireRole } from "@/components/layout/require-role";
import { WorkspaceContainer } from "@/components/interview-workspace/workspace-container";
import { getLocale } from "@/lib/i18n/server";
import { getActiveRegion } from "@/lib/region";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const locale = await getLocale();
  const { consent, defaultLocale, locales, minimumAge, cautionVocabulary } = getActiveRegion();
  return (
    <Suspense>
      <RequireRole locale={locale} roles={["creator"]}>
        <WorkspaceContainer
          locale={locale}
          params={params}
          region={{ consent, defaultLocale, locales, minimumAge, cautionVocabulary }}
        />
      </RequireRole>
    </Suspense>
  );
}
