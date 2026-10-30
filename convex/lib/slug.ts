import type { Script } from "../../src/lib/domain/constants";
import type { QueryCtx } from "../_generated/server";
import { appError } from "./errors";

/** Prefer the first Latin name, then romaji, without deriving a name from another script. */
export function slugBase(names: readonly { script: Script; value: string }[]): string {
  const name =
    names.find((name) => name.script === "latin") ?? names.find((name) => name.script === "romaji");
  return (
    (name?.value ?? "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "place"
  );
}

/** The index read also makes concurrent creators contend on the chosen region and slug. */
export async function uniqueSlug(ctx: QueryCtx, regionId: string, base: string): Promise<string> {
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const existing = await ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", regionId).eq("slug", slug))
      .unique();
    if (existing === null) return slug;
  }
  throw appError("conflict", "all 50 slugs for this name are already in use in this region");
}
