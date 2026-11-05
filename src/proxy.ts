import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { localeFromPathname, negotiateLocale } from "@/lib/i18n";
import { activeRegionConfig } from "@/lib/region/registry";

const region = activeRegionConfig();

// Not pages: never given a language prefix. Most static files do not reach the proxy (see the matcher),
// but a .mjs file does, so the map worker folder (public/maplibre, see scripts/copy-maplibre-worker.mjs) is named here.
const UNPREFIXED = /^\/(?:api|out|_next|maplibre)(?:\/|$)|^\/robots\.txt$/;

// The pages for a role need a signed-in visitor (contracts/http-api.md). This only sends a signed-out
// visitor to the sign-in page. The role is checked again inside every Convex function (research D2),
// so a gap here cannot expose data. API routes check their own caller, so they answer 401 as JSON
// rather than Clerk's redirect or 404.
const ROLE_PAGES = /^\/[^/]+\/(?:creator|owner|steward|stamps)(?:\/|$)/;

function requestLocale(request: NextRequest): string {
  return (
    localeFromPathname(request.nextUrl.pathname, region.locales) ??
    negotiateLocale(request.headers.get("accept-language"), region.locales, region.defaultLocale)
  );
}

export default clerkMiddleware(
  async (auth, request) => {
    const { pathname } = request.nextUrl;
    // The bare domain and /{locale} are the front door: a signed-out visitor meets Noren on the welcome
    // page, and its "Open the map" leads to /{locale}/map, which is open to everyone. Links to a place
    // or any other page are left alone, so a shared link keeps working.
    const home = async () => ((await auth()).isAuthenticated ? "/map" : "/welcome");
    const locale = localeFromPathname(pathname, region.locales);
    if (!UNPREFIXED.test(pathname) && locale === null) {
      const rest = pathname === "/" ? await home() : pathname;
      const url = request.nextUrl.clone();
      url.pathname = `/${requestLocale(request)}${rest}`;
      return NextResponse.redirect(url);
    }
    if (pathname === `/${locale}`) {
      const url = request.nextUrl.clone();
      url.pathname = `${pathname}${await home()}`;
      return NextResponse.redirect(url);
    }
    if (ROLE_PAGES.test(pathname)) {
      await auth.protect();
    }
  },
  (request) => ({ signInUrl: `/${requestLocale(request)}/sign-in` }),
);

export const config = {
  matcher: [
    // Skip Next.js internals and static files, as Clerk recommends.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|vtt)).*)",
    "/(api|trpc)(.*)",
  ],
};
