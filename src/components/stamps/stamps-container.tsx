"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Locale } from "@/lib/i18n";
import { messagesFor } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import type { StampRegion } from "./stamp";
import { StampsView } from "./stamps-view";

export function StampsContainer({ locale, region }: { locale: Locale; region: StampRegion }) {
  const stamps = useQuery(api.stampBook.mine);
  return (
    <>
      {stamps === undefined && <p role="status">{messagesFor(publicMessages, locale).loading}</p>}
      <StampsView locale={locale} region={region} stamps={stamps} />
    </>
  );
}
