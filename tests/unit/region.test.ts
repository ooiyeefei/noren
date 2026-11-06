import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveRegionPolicy, loadRegions, parseRegionFile, type RegionConfig } from "@/lib/region";

const nagasakiText = readFileSync(path.join(process.cwd(), "regions/nagasaki.json"), "utf8");
const nagasaki = () => JSON.parse(nagasakiText) as RegionConfig;

function parse(mutate: (region: RegionConfig) => void, fileName = "nagasaki.json") {
  const region = nagasaki();
  mutate(region);
  return parseRegionFile(fileName, JSON.stringify(region));
}

function problemOf(result: ReturnType<typeof parse>) {
  return result.ok ? "" : result.problem;
}

describe("region loader", () => {
  it("accepts the shipped Nagasaki file and finds it in regions/", () => {
    expect(parseRegionFile("nagasaki.json", nagasakiText).ok).toBe(true);
    expect(loadRegions().get("nagasaki")?.locales).toEqual(["ja", "en"]);
  });

  it("rejects text that is not JSON, naming the file", () => {
    const result = parseRegionFile("broken.json", "{ nope");
    expect(problemOf(result)).toContain("broken.json is not valid JSON");
  });

  it("rejects a file whose id does not match its name", () => {
    expect(problemOf(parse(() => {}, "tokyo.json"))).toContain('declares id "nagasaki"');
  });

  it("rejects a missing translation for a locale", () => {
    const result = parse((r) => delete r.name["en"]);
    expect(problemOf(result)).toContain('missing locale "en"');
  });

  it("rejects an inverted bbox and a centre outside it", () => {
    expect(problemOf(parse((r) => (r.bbox = [130, 32, 129, 33])))).toContain("west must be less");
    expect(problemOf(parse((r) => (r.defaultCenter.lat = 10)))).toContain("must lie inside bbox");
  });

  it("requires the link card fallback and all four consent scopes", () => {
    expect(problemOf(parse((r) => (r.enabledSourceAdapters = ["youtube"])))).toContain("link_card");
    expect(problemOf(parse((r) => (r.consent.requiredScopes = ["publish"])))).toContain(
      "aiProcessing",
    );
  });

  it("lists a consent version as naming Modal only when its text names Modal in every language", () => {
    expect(nagasaki().consent.versionsNamingModal).toContain(nagasaki().consent.textVersion);
    const unnamed = (r: RegionConfig) =>
      (r.consent.text.ja = r.consent.text.ja!.replaceAll("Modal", "米国の事業者"));
    expect(problemOf(parse(unnamed))).toContain("must name Modal");
    // A text that does not name Modal is valid as long as it is not listed: the check stays off.
    expect(
      parse((r) => {
        unnamed(r);
        r.consent.versionsNamingModal = [];
      }).ok,
    ).toBe(true);
  });

  it("takes aerial photos only from an HTTPS tile template, and they are optional", () => {
    expect(parse((r) => delete r.geo.aerialPhoto).ok).toBe(true);
    for (const tiles of [
      "http://photos.mock.example/{z}/{x}/{y}.jpg",
      "https://photos.mock.example/photo.jpg",
      "https://photos.mock.example/{x}/{y}/{z}.jpg",
    ])
      expect(problemOf(parse((r) => (r.geo.aerialPhoto!.tiles = tiles)))).toContain("tiles");
    expect(problemOf(parse((r) => (r.geo.aerialPhoto!.credit = "")))).toContain("credit");
  });

  it("rejects unknown keys so typos do not pass silently", () => {
    expect(problemOf(parse((r) => Object.assign(r, { minimumAges: 16 })))).toContain("minimumAges");
  });

  it("refuses launchPackComplete without an operator and a takedown contact", () => {
    const problem = problemOf(
      parse((r) => {
        r.legal.operatorName = null;
        r.legal.launchPackComplete = true;
        r.takedown.contact = null;
      }),
    );
    expect(problem).toContain("operatorName");
    expect(problem).toContain("contact");
  });

  it("accepts the takedown form's address as the public contact, so only the operator name is missing", () => {
    const problem = problemOf(
      parse((r) => {
        r.legal.operatorName = null;
        r.legal.launchPackComplete = true;
      }),
    );
    expect(problem).toContain("operatorName");
    expect(problem).not.toContain("contact");
  });

  it("refuses open accounts without the documents, an operator and a takedown contact", () => {
    const open = (mutate: (r: RegionConfig) => void) =>
      problemOf(
        parse((r) => {
          r.legal.accountsOpen = true;
          r.legal.documentsVersion = "2026-11-05";
          mutate(r);
        }),
      );
    expect(open(() => {})).toBe("");
    expect(
      open((r) => {
        r.legal.documentsVersion = null;
      }),
    ).toContain("documentsVersion");
    expect(
      open((r) => {
        r.legal.operatorName = null;
      }),
    ).toContain("operatorName");
    expect(
      open((r) => {
        r.takedown.contact = null;
      }),
    ).toContain("contact");
  });

  it("rejects a collection setting that makes no sense", () => {
    expect(
      problemOf(
        parse((r) => {
          r.collection.checkInMetres = 0;
        }),
      ),
    ).toContain("checkInMetres");
  });
});

describe("region policy", () => {
  it("forces the restrictions while the launch pack is incomplete", () => {
    const region = loadRegions().get("nagasaki")!;
    expect(region.legal.launchPackComplete).toBe(false);
    expect(deriveRegionPolicy(region)).toEqual({
      inviteOnly: true,
      noindex: true,
      allowPilotVisibility: false,
      realBusinessesDraftOnly: true,
    });
  });

  it("the shipped file names the operator but keeps the launch pack switch off until the owner flips it", () => {
    const region = loadRegions().get("nagasaki")!;
    expect(region.legal.operatorName).toBe("Noren, an open-source project run by Yee Fei");
    expect(region.legal.launchPackComplete).toBe(false);
  });

  it("ships with accounts closed and the documents the owner approved", () => {
    const { legal } = loadRegions().get("nagasaki")!;
    expect(legal.accountsOpen).toBe(false);
    expect(legal.documentsVersion).toBe("2026-11-06");
  });

  it("opening accounts ends invite-only and changes no other launch rule", () => {
    const region = loadRegions().get("nagasaki")!;
    expect(
      deriveRegionPolicy({
        ...region,
        legal: { ...region.legal, accountsOpen: true, documentsVersion: "2026-11-05" },
      }),
    ).toEqual({
      inviteOnly: false,
      noindex: true,
      allowPilotVisibility: false,
      realBusinessesDraftOnly: true,
    });
  });

  it("lifts them only when the launch pack is complete", () => {
    const region = loadRegions().get("nagasaki")!;
    const policy = deriveRegionPolicy({
      ...region,
      legal: { ...region.legal, launchPackComplete: true },
    });
    expect(policy).toEqual({
      inviteOnly: false,
      noindex: false,
      allowPilotVisibility: true,
      realBusinessesDraftOnly: false,
    });
  });
});
