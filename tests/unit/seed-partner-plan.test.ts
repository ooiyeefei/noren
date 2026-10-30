import { describe, expect, it } from "vitest";
import { parsePartnerData, partnerSteps } from "../../scripts/lib/partner-plan";
const business = {
  names: [{ lang: "en", script: "latin", value: "Mock partner fixture", isPrimary: true }],
  pin: { lat: 32.75, lng: 129.88 },
  publicSource: "https://example.com/public-facts",
  category: "Mock category",
  address: "Mock address",
};
describe("partner plan", () => {
  it.each(["publicSource", "pin", "names"])("an entry without %s is refused", (field) => {
    const input: Record<string, unknown> = { ...business };
    delete input[field];
    expect(() => parsePartnerData({ regionId: "nagasaki", businesses: [input] })).toThrow();
  });
  it("an extra field is refused", () => {
    expect(() =>
      parsePartnerData({
        regionId: "nagasaki",
        businesses: [{ ...business, description: "Do not invent descriptions" }],
      }),
    ).toThrow();
  });
  it("existing names are skipped", () => {
    const data = parsePartnerData({ regionId: "nagasaki", businesses: [business, business] });
    expect(partnerSteps(data, [{ names: [{ value: business.names[0]!.value }] }])).toEqual([]);
    expect(partnerSteps(data, [])).toHaveLength(1);
  });
  it("every step creates a business draft", () => {
    const steps = partnerSteps(
      parsePartnerData({ regionId: "nagasaki", businesses: [business] }),
      [],
    );
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      fn: "places:create",
      as: "steward",
      args: { kind: "business" },
      notStored: { category: business.category, address: business.address },
    });
    expect(steps[0]!.args).not.toHaveProperty("visibility");
    expect(steps[0]!.args).not.toHaveProperty("publicSource");
    expect(steps[0]!.args).not.toHaveProperty("address");
  });
});
