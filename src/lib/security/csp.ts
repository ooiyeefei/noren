import { frameHostsFor, scriptHostsFor } from "../adapters";
import type { SourceAdapterId } from "../domain/constants";
import type { RegionConfig } from "../region/schema";

export const CSP_DIRECTIVES = [
  "default-src",
  "script-src",
  "style-src",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "frame-src",
  "worker-src",
  "object-src",
  "base-uri",
  "form-action",
  "frame-ancestors",
] as const;
export type CspDirective = (typeof CSP_DIRECTIVES)[number];

export type CspInput = {
  mode: "production" | "development";
  clerkFrontendApi: string;
  convexUrl: string;
  mapStyleUrl: string;
  adapterIds: readonly SourceAdapterId[];
  extra?: Partial<Record<CspDirective, readonly string[]>>;
};

export class CspConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CspConfigError";
  }
}

function httpsUrl(value: string, name: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hostname.includes("*")) {
      throw new Error();
    }
    return url;
  } catch {
    throw new CspConfigError(`Invalid ${name}`);
  }
}

function convexOrigin(value: string, name: string): string {
  const url = httpsUrl(value, name);
  if (!url.hostname.endsWith(".convex.cloud")) throw new CspConfigError(`Invalid ${name}`);
  return url.origin;
}

export function cspDirectives(input: CspInput): Record<CspDirective, string[]> {
  if (input.mode !== "production" && input.mode !== "development") {
    throw new CspConfigError("Invalid mode");
  }
  const clerk = httpsUrl(input.clerkFrontendApi, "clerkFrontendApi").origin;
  const convex = convexOrigin(input.convexUrl, "convexUrl");
  const map = httpsUrl(input.mapStyleUrl, "mapStyleUrl").origin;
  let scripts: string[];
  let frames: string[];
  try {
    scripts = scriptHostsFor(input.adapterIds);
    frames = frameHostsFor(input.adapterIds);
  } catch {
    throw new CspConfigError("Invalid adapterIds");
  }
  const directives: Record<CspDirective, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(input.mode === "development" ? ["'unsafe-eval'"] : []),
      clerk,
      "https://cdn.protect.clerk.com",
      "https://*.client.protect.clerk.com",
      "https://challenges.cloudflare.com",
      ...scripts,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      clerk,
      "https://img.clerk.com",
      "https://*.client.protect.clerk.com:*",
      convex,
      convex.replace(/^https:/, "wss:"),
      map,
    ],
    "media-src": ["'self'", "blob:", convex],
    "frame-src": ["https://challenges.cloudflare.com", ...frames, ...scripts],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  for (const [directive, sources] of Object.entries(input.extra ?? {})) {
    if (!CSP_DIRECTIVES.includes(directive as CspDirective) || !Array.isArray(sources)) {
      throw new CspConfigError("Invalid extra directive");
    }
    for (const source of sources) {
      if (typeof source !== "string" || !/^https:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/.test(source)) {
        throw new CspConfigError(`Invalid extra source for ${directive}`);
      }
      directives[directive as CspDirective].push(source);
    }
  }
  for (const directive of CSP_DIRECTIVES) {
    directives[directive] = [...new Set(directives[directive])];
    if (
      ["script-src", "frame-src", "connect-src"].includes(directive) &&
      directives[directive].some((source) => ["*", "https:", "http:", "data:"].includes(source))
    ) {
      throw new CspConfigError(`Forbidden source for ${directive}`);
    }
  }
  return directives;
}

export function buildCsp(input: CspInput, options: { enforce: boolean }): string {
  const directives = cspDirectives(input);
  return (
    CSP_DIRECTIVES.map((directive) => `${directive} ${directives[directive].join(" ")}`).join(
      "; ",
    ) + (options.enforce ? "; upgrade-insecure-requests" : "")
  );
}

export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/]+={0,2})$/.exec(publishableKey ?? "");
  if (!match) return null;
  try {
    const decoded = atob(match[1]!);
    if (btoa(decoded).replace(/=+$/, "") !== match[1]!.replace(/=+$/, "")) return null;
    if (!decoded.endsWith("$")) return null;
    const host = decoded.slice(0, -1);
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(host))
      return null;
    return httpsUrl(`https://${host}`, "publishableKey").origin;
  } catch {
    return null;
  }
}

export function cspHeaderFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  options: { enforce: boolean; region: Pick<RegionConfig, "geo" | "enabledSourceAdapters"> },
): { key: "Content-Security-Policy" | "Content-Security-Policy-Report-Only"; value: string } {
  const clerk = clerkFrontendApiOrigin(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!clerk) throw new CspConfigError("Invalid NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const convex = convexOrigin(env.NEXT_PUBLIC_CONVEX_URL ?? "", "NEXT_PUBLIC_CONVEX_URL");
  if (!["production", "development", "test"].includes(env.NODE_ENV ?? "")) {
    throw new CspConfigError("Invalid NODE_ENV");
  }
  return {
    key: options.enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: buildCsp(
      {
        mode: env.NODE_ENV === "development" ? "development" : "production",
        clerkFrontendApi: clerk,
        convexUrl: convex,
        mapStyleUrl: options.region.geo.mapStyle.url,
        adapterIds: options.region.enabledSourceAdapters,
      },
      options,
    ),
  };
}
