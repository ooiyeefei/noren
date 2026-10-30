import "server-only";

import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Role } from "../domain/constants";
import { jsonError } from "../http/handler";

export async function convexToken(): Promise<string | null> {
  const session = await auth();
  if (!session.userId) return null;
  return session.sessionClaims?.aud === "convex"
    ? await session.getToken()
    : await session.getToken({ template: "convex" });
}

export type ServerPerson = NonNullable<FunctionReturnType<typeof api.people.current>>;

export async function currentPersonOnServer(): Promise<ServerPerson | null> {
  const token = await convexToken();
  return token === null ? null : await fetchQuery(api.people.current, {}, { token });
}

export async function requireRoleOnServer(
  roles: readonly Exclude<Role, "business_owner">[],
): Promise<{ ok: true; person: ServerPerson } | { ok: false; response: Response }> {
  const person = await currentPersonOnServer();
  if (person === null) {
    return { ok: false, response: jsonError("unauthenticated", "sign in to continue") };
  }
  const allowed = new Set<Role>(roles);
  if (allowed.has("creator")) allowed.add("steward");
  if (!allowed.has(person.role)) {
    return {
      ok: false,
      response: jsonError("forbidden", `the ${person.role} role may not do this`),
    };
  }
  return { ok: true, person };
}
