import type { AuthConfig } from "convex/server";

// Clerk's Frontend API URL, set on each Convex deployment (specs/001-noren-mvp/quickstart.md).
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (!domain) {
  throw new Error(
    "CLERK_JWT_ISSUER_DOMAIN is not set on this Convex deployment; run `npx convex env set CLERK_JWT_ISSUER_DOMAIN <Clerk Frontend API URL>`",
  );
}

export default {
  providers: [{ domain, applicationID: "convex" }],
} satisfies AuthConfig;
