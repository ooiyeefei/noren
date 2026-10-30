"use client";

import { DemoBadge } from "@/components/badges/demo-badge";
import { PageContainer } from "@/components/layout/page-container";
import type { Role } from "@/lib/domain/constants";
import { messagesFor, type Locale } from "@/lib/i18n";
import { stewardMessages } from "@/lib/i18n/messages/steward";
import { roleOptions } from "./steward-logic";
import { StewardFeedback, StewardNav, type ActionState } from "./steward-home-view";

export type PersonRow = {
  _id: string;
  displayName: string;
  role: Role;
  isMock: boolean;
  verifiedAt?: number;
};
export function PeopleView(
  props: ActionState & {
    locale: Locale;
    people: readonly PersonRow[];
    onRole: (personId: string, role: Exclude<Role, "steward">) => void;
  },
) {
  const { locale, people, pending, onRole } = props;
  const m = messagesFor(stewardMessages, locale);
  return (
    <PageContainer locale={locale} title={m.people}>
      <StewardNav locale={locale} />
      <p>{m.invitations}</p>
      <p>{m.roleRule}</p>
      <StewardFeedback {...props} />
      {!people.length && <p>{m.empty}</p>}
      <ul className="space-y-4">
        {people.map((person) => {
          const options = roleOptions(person);
          return (
            <li key={person._id} className="flex flex-wrap items-center gap-4 rounded border p-4">
              <span>{person.displayName}</span>
              <span>{m[person.role]}</span>
              {person.isMock && <DemoBadge locale={locale} />}
              {options && (
                <label>
                  {m.role}
                  <select
                    className="ml-2 rounded border p-2"
                    value={person.role}
                    disabled={!!pending}
                    onChange={(event) => {
                      const role = event.target.value;
                      if (role === "user" || role === "creator" || role === "business_owner")
                        onRole(person._id, role);
                    }}
                  >
                    {options.map((role) => (
                      <option key={role} value={role}>
                        {m[role]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
