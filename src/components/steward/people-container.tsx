"use client";
import { use } from "react";
import { useMutation, useQuery } from "convex/react";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useStewardAction } from "./steward-home-container";
import { PeopleView } from "./people-view";
export function PeopleContainer({
  params,
  locale,
}: {
  params: Promise<{ lang: string }>;
  locale: Locale;
}) {
  use(params);
  const people = useQuery(api.stewardPeople.list, {});
  const setRole = useMutation(api.people.setRole);
  const { state, run } = useStewardAction(locale);
  if (people === undefined)
    return <p role="status">{messagesFor(stewardMessages, locale).loading}</p>;
  return (
    <PeopleView
      locale={locale}
      people={people}
      {...state}
      onRole={(personId, role) =>
        void run(`role:${personId}`, async () => {
          await setRole({ personId: personId as Id<"person">, role });
        })
      }
    />
  );
}
