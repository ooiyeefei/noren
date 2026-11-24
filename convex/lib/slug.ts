import type { Script } from "../../src/lib/domain/constants";
import { REGION_CONFIGS } from "../../src/lib/region/registry";
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

/** How many numbered slugs a name may take across every region before a new place is refused. */
export const SLUG_ATTEMPTS = 200;

/**
 * The first of `base`, `base-2`, `base-3` ... that no place uses in any region: a place URL holds
 * only the slug, so a Malaysian "Starbucks" must not take a Nagasaki one's, even while a region is
 * off. The index reads also make concurrent creators contend on the chosen slug.
 */
export async function uniqueSlug(ctx: QueryCtx, regionId: string, base: string): Promise<string> {
  const regions = [regionId, ...[...REGION_CONFIGS.keys()].filter((id) => id !== regionId)];
  for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    let taken = false;
    for (const id of regions) {
      const existing = await ctx.db
        .query("place")
        .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", id).eq("slug", slug))
        .first();
      if (existing !== null) {
        taken = true;
        break;
      }
    }
    if (!taken) return slug;
  }
  throw appError("conflict", `all ${SLUG_ATTEMPTS} slugs for this name are already in use`);
}

/** A place URL contains only the slug, even when the other region is currently off. */
export async function requireSlugAvailableOutsideRegion(
  ctx: QueryCtx,
  regionId: string,
  slug: string,
): Promise<void> {
  for (const otherRegionId of REGION_CONFIGS.keys()) {
    if (otherRegionId === regionId) continue;
    const existing = await ctx.db
      .query("place")
      .withIndex("by_regionId_and_slug", (q) => q.eq("regionId", otherRegionId).eq("slug", slug))
      .first();
    if (existing !== null) throw appError("conflict", "slug already used in another region");
  }
}
