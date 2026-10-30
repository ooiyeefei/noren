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
      <div className="min-w-0 space-y-6 text-kon [overflow-wrap:anywhere]">
        <StewardNav locale={locale} current="people" />
        <p>{m.invitations}</p>
        <p>{m.roleRule}</p>
        <StewardFeedback {...props} />
        {!people.length && <p>{m.empty}</p>}
        <ul className="space-y-4">
          {people.map((person) => {
            const options = roleOptions(person);
            return (
              <li
                key={person._id}
                data-steward-card="person"
                className="min-w-0 space-y-3 rounded-[10px] border border-line p-4"
              >
                <p>
                  <span className="mr-2 font-bold">{m.name}</span>
                  {person.displayName}
                </p>
                <p>
                  <span className="mr-2 font-bold">{m.role}</span>
                  {m[person.role]}
                </p>
                {person.isMock && <DemoBadge locale={locale} />}
                {options && (
                  <label>
                    {m.role}
                    <select
                      className="block min-h-11 w-full min-w-0 max-w-full rounded-[10px] border border-input bg-white p-2 text-kon"
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
      </div>
    </PageContainer>
  );
}
