import { auth, clerkClient } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { convexToken } from "@/lib/convex/server";
import { errorResponse, jsonError } from "@/lib/http/handler";
import { api } from "../../../../../convex/_generated/api";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

/** For the log: the error's name and message, and never an empty string, whatever was thrown. */
function describeError(error: unknown): string {
  if (error instanceof Error)
    return `${error.name.trim() || "Error"}: ${error.message.trim() || "no message"}`;
  try {
    return `non-Error throw: ${String(error).trim() || "empty value"}`;
  } catch {
    return "non-Error throw that cannot be read";
  }
}

const alreadyGone = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

/**
 * Deletes the caller's account: Noren's data first, because that step needs the Clerk token, then
 * the Clerk user (research R12).
 *
 * If the Clerk step fails, Noren's step can't be rolled back. The person's row is empty, the rest of
 * their rows are going through `people.continueDeletion`, and their Clerk user and session still
 * work. So they are signed in with nothing in Noren: `people.current` is null until a page load's
 * `ensureCurrent` makes a new empty row. This answers 502 clerk_failed and the page offers the button
 * again. Pressing again is safe, because `people.deleteMine` finds no row, or empties the new one,
 * and then the Clerk step runs again. If they never press again, Clerk keeps their sign-in details,
 * and anything they do after signing in belongs to a new Noren account with none of the old data.
 */
export async function POST(request: Request): Promise<Response> {
  // This can't be undone, so don't rely on the session cookie's SameSite setting alone.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return jsonError("forbidden", "this request came from another site");
  }
  let userId: string | null;
  try {
    ({ userId } = await auth());
    if (!userId) return jsonError("unauthenticated", "sign in to continue");
    const token = await convexToken();
    if (token === null) return jsonError("unauthenticated", "sign in to continue");
    await fetchMutation(api.people.deleteMine, {}, { token });
  } catch (error) {
    // A refusal keeps its code, and anything else is logged with its name. The Clerk step never ran.
    return errorResponse(error);
  }
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (error) {
    // A 404 means an earlier press deleted the user and its answer never reached the person.
    if (!alreadyGone(error)) {
      console.error(`account deletion: the Clerk step failed (${describeError(error)})`);
      return Response.json(
        {
          error: {
            code: "clerk_failed",
            message: "Noren's data is gone, and the sign-in could not be closed. Press again.",
          },
        },
        { status: 502, headers: HEADERS },
      );
    }
  }
  return Response.json({ ok: true }, { headers: HEADERS });
}
