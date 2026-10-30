import { describe, expect, it } from "vitest";
import { frameHostsFor, scriptHostsFor } from "../../src/lib/adapters";
import { activeRegionConfig } from "../../src/lib/region/registry";
import {
  buildCsp,
  clerkFrontendApiOrigin,
  CspConfigError,
  cspDirectives,
  cspHeaderFromEnv,
  CSP_DIRECTIVES,
  type CspInput,
  type CspDirective,
} from "../../src/lib/security/csp";

const region = activeRegionConfig();
const key = "pk_test_" + btoa("example.clerk.accounts.dev$");
const input: CspInput = {
  mode: "production",
  clerkFrontendApi: "https://example.clerk.accounts.dev/path",
  convexUrl: "https://example.ap-southeast-2.convex.cloud/path?query=mock",
  mapStyleUrl: region.geo.mapStyle.url,
  adapterIds: region.enabledSourceAdapters,
};
const env = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key,
  NEXT_PUBLIC_CONVEX_URL: input.convexUrl,
  NODE_ENV: "production",
};

describe("CSP", () => {
  it("script-src contains the Clerk Protect hosts", () => {
    expect(cspDirectives(input)["script-src"]).toEqual(
      expect.arrayContaining([
        "https://cdn.protect.clerk.com",
        "https://*.client.protect.clerk.com",
      ]),
    );
  });

  it("connect-src contains the Clerk Protect wildcard with any port", () => {
    expect(cspDirectives(input)["connect-src"]).toContain("https://*.client.protect.clerk.com:*");
  });

  it("adds no http or wildcard-everything source or production unsafe-eval", () => {
    for (const source of Object.values(cspDirectives(input)).flat()) {
      expect(source).not.toBe("*");
      expect(source).not.toMatch(/^http:/);
      expect(source).not.toBe("'unsafe-eval'");
    }
  });

  it("the report-only header carries the Clerk Protect hosts end to end", () => {
    const header = cspHeaderFromEnv(env, { enforce: false, region });
    expect(header.key).toBe("Content-Security-Policy-Report-Only");
    const directives = header.value.split("; ");
    expect(directives.find((part) => part.startsWith("script-src "))).toContain(
      "https://cdn.protect.clerk.com https://*.client.protect.clerk.com",
    );
    expect(directives.find((part) => part.startsWith("connect-src "))).toContain(
      "https://*.client.protect.clerk.com:*",
    );
  });

  it("production has no unsafe-eval; development has it in script-src only", () => {
    expect(Object.values(cspDirectives(input)).flat()).not.toContain("'unsafe-eval'");
    const dev = cspDirectives({ ...input, mode: "development" });
    expect(CSP_DIRECTIVES.filter((name) => dev[name].includes("'unsafe-eval'"))).toEqual([
      "script-src",
    ]);
  });

  it("script-src has exactly the enabled adapters' script hosts and required app sources", () => {
    const scripts = cspDirectives(input)["script-src"];
    expect(scripts).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://example.clerk.accounts.dev",
      "https://cdn.protect.clerk.com",
      "https://*.client.protect.clerk.com",
      "https://challenges.cloudflare.com",
      ...scriptHostsFor(region.enabledSourceAdapters),
    ]);
    expect(scripts).toContain("https://www.instagram.com");
    expect(scripts).toContain("https://platform.twitter.com");
  });

  it("frame-src holds the frame hosts and script hosts of enabled adapters only", () => {
    expect(cspDirectives(input)["frame-src"]).toEqual([
      ...new Set([
        "https://challenges.cloudflare.com",
        ...frameHostsFor(input.adapterIds),
        ...scriptHostsFor(input.adapterIds),
      ]),
    ]);
    expect(cspDirectives({ ...input, adapterIds: ["link_card", "youtube"] })["frame-src"]).toEqual([
      "https://challenges.cloudflare.com",
      "https://www.youtube-nocookie.com",
    ]);
  });

  it("Meta enables both Facebook and Instagram frame origins", () => {
    expect(frameHostsFor(["meta_embed"])).toEqual([
      "https://www.facebook.com",
      "https://www.instagram.com",
    ]);
    expect(cspDirectives({ ...input, adapterIds: ["meta_embed"] })["frame-src"]).toEqual([
      "https://challenges.cloudflare.com",
      "https://www.facebook.com",
      "https://www.instagram.com",
    ]);
    expect(cspDirectives({ ...input, adapterIds: [] })["frame-src"]).not.toContain(
      "https://www.instagram.com",
    );
  });

  it("connect-src has Convex https/wss, Clerk and map origins without paths", () => {
    expect(
      cspDirectives({
        ...input,
        mapStyleUrl: "https://tiles.openfreemap.org/styles/liberty?mock=1",
      })["connect-src"],
    ).toEqual([
      "'self'",
      "https://example.clerk.accounts.dev",
      "https://img.clerk.com",
      "https://*.client.protect.clerk.com:*",
      "https://example.ap-southeast-2.convex.cloud",
      "wss://example.ap-southeast-2.convex.cloud",
      "https://tiles.openfreemap.org",
    ]);
  });

  it("media-src allows blob and the Convex origin", () => {
    expect(cspDirectives(input)["media-src"]).toEqual([
      "'self'",
      "blob:",
      "https://example.ap-southeast-2.convex.cloud",
    ]);
  });

  it("sets image, font, worker and document restrictions", () => {
    expect(cspDirectives(input)).toMatchObject({
      "default-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https://img.clerk.com"],
      "font-src": ["'self'"],
      "worker-src": ["'self'", "blob:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it.each(["script-src", "frame-src", "connect-src"] as const)(
    "refuses broad sources in %s including extras",
    (directive) => {
      expect(cspDirectives(input)[directive]).not.toEqual(expect.arrayContaining(["*"]));
      for (const source of ["*", "https:", "http:", "data:"]) {
        expect(cspDirectives(input)[directive]).not.toContain(source);
        expect(() => cspDirectives({ ...input, extra: { [directive]: [source] } })).toThrow(
          CspConfigError,
        );
      }
    },
  );

  it("upgrade-insecure-requests only when enforcing", () => {
    expect(buildCsp(input, { enforce: false })).not.toContain("upgrade-insecure-requests");
    expect(buildCsp(input, { enforce: true })).toBe(
      buildCsp(input, { enforce: false }) + "; upgrade-insecure-requests",
    );
  });

  it("the header is one line, each directive once, stable order", () => {
    const header = buildCsp(input, { enforce: false });
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.split("; ").map((part) => part.split(" ")[0])).toEqual(CSP_DIRECTIVES);
    expect(buildCsp(input, { enforce: false })).toBe(header);
  });

  it.each(["clerkFrontendApi", "convexUrl", "mapStyleUrl"] as const)(
    "rejects http and credentials in %s",
    (field) => {
      for (const value of [
        "http://example.convex.cloud/path",
        "https://mock:mock@example.convex.cloud/path",
        "malformed",
      ]) {
        expect(() => cspDirectives({ ...input, [field]: value })).toThrow(CspConfigError);
      }
    },
  );

  it("rejects non-convex.cloud Convex hosts", () => {
    for (const convexUrl of [
      "https://convex.cloud",
      "https://example.convex.cloud.evil.example",
      "https://example.convex.site",
    ]) {
      expect(() => cspDirectives({ ...input, convexUrl })).toThrow(CspConfigError);
    }
  });

  it("errors name the variable and never its value, including missing values", () => {
    for (const variable of [
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_CONVEX_URL",
      "NODE_ENV",
    ] as const) {
      for (const value of [undefined, "mock-private-invalid-value"]) {
        const run = () =>
          cspHeaderFromEnv({ ...env, [variable]: value }, { enforce: false, region });
        expect(run).toThrow(CspConfigError);
        expect(run).toThrow(variable);
        try {
          run();
        } catch (error) {
          expect((error as Error).message).not.toContain("mock-private-invalid-value");
        }
      }
    }
  });

  it("clerkFrontendApiOrigin decodes test/live keys and returns null for garbage", () => {
    for (const prefix of ["pk_test_", "pk_live_"]) {
      expect(clerkFrontendApiOrigin(prefix + btoa("example.clerk.accounts.dev$"))).toBe(
        "https://example.clerk.accounts.dev",
      );
    }
    for (const value of [
      undefined,
      "garbage",
      "pk_test_!",
      "pk_live_A",
      ...[
        "example.com",
        "https://example.com$",
        "mock@example.com$",
        "example.com/path$",
        "*.example.com$",
        "example.com$\n",
        "example.com:443$",
      ].map((host) => "pk_test_" + btoa(host)),
    ]) {
      expect(clerkFrontendApiOrigin(value)).toBeNull();
    }
  });

  it("cspHeaderFromEnv returns Report-Only unless enforce is true", () => {
    for (const enforce of [false, true]) {
      expect(cspHeaderFromEnv(env, { enforce, region })).toEqual({
        key: enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
        value: buildCsp(input, { enforce }),
      });
    }
  });

  it("extra sources land in their directive only and are deduplicated", () => {
    const directives = cspDirectives({
      ...input,
      extra: { "img-src": ["https://*.mock.example:443", "https://img.clerk.com"] },
    });
    expect(directives["img-src"]).toEqual([
      ...cspDirectives(input)["img-src"],
      "https://*.mock.example:443",
    ]);
    for (const directive of CSP_DIRECTIVES.filter((name) => name !== "img-src")) {
      expect(directives[directive]).toEqual(cspDirectives(input)[directive]);
    }
  });

  it("rejects unknown extra directives and non-host extra values", () => {
    expect(() =>
      cspDirectives({
        ...input,
        extra: { ["report-uri" as CspDirective]: ["https://mock.example"] },
      }),
    ).toThrow(CspConfigError);
    for (const source of [
      "https://mock.example/path",
      "https://mock.example; script-src *",
      "https://mock.example\n",
      "https://mock:mock@mock.example",
    ]) {
      expect(() => cspDirectives({ ...input, extra: { "script-src": [source] } })).toThrow(
        CspConfigError,
      );
    }
  });
});
