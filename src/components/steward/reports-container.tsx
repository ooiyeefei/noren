"use client";

import { useMutation, useQuery } from "convex/react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { checkMessages } from "@/lib/i18n/messages/checks";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { pickPlaceName } from "@/lib/region/names";
import type { RegionConfig } from "@/lib/region/schema";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ReportsView } from "./reports-view";
import { useStewardAction } from "./steward-home-container";

export function ReportsContainer({ locale, region }: { locale: Locale; region: RegionConfig }) {
  const reports = useQuery(api.checks.listOpenReports, { regionId: region.id });
  const resolve = useMutation(api.checks.resolveReport);
  const { state, run } = useStewardAction(locale);
  const m = messagesFor(checkMessages, locale);
  if (!reports) return <p role="status">{messagesFor(stewardMessages, locale).loading}</p>;
  return (
    <ReportsView
      locale={locale}
      rows={reports.map((report) => ({
        id: report._id,
        slug: report.slug,
        name: pickPlaceName(report.names, locale, region).primary?.value ?? report.slug,
        problem: report.problem,
        note: report.note,
        reportedAt: report.reportedAt,
        reporterName: report.reporterName,
        isMock: report.isMock,
        confirmedAt: report.confirmedAt,
      }))}
      {...state}
      onResolve={(id, outcome) =>
        void run(`${outcome}:${id}`, async () => {
          await resolve({ checkId: id as Id<"placeCheck">, outcome });
          return outcome === "kept" ? m.kept : m.hidden;
        })
      }
    />
  );
}
