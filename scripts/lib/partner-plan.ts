import { z } from "zod";
import { namesSchema, pinSchema } from "./demo-plan";

const schema = z.strictObject({
  regionId: z.string().min(1),
  businesses: z
    .array(
      z.strictObject({
        names: namesSchema,
        pin: pinSchema,
        publicSource: z
          .url()
          .refine((value) => ["https:", "http:"].includes(new URL(value).protocol)),
        category: z.string().min(1).optional(),
        address: z.string().min(1).optional(),
      }),
    )
    .min(1),
});
export type PartnerData = z.infer<typeof schema>;
export function parsePartnerData(json: unknown): PartnerData {
  return schema.parse(json);
}
export function partnerSteps(
  data: PartnerData,
  existing: readonly { names: readonly { value: string }[] }[],
) {
  const seen = new Set(existing.flatMap((p) => p.names.map((n) => n.value.trim())));
  return data.businesses.flatMap((business) => {
    if (business.names.some((n) => seen.has(n.value.trim()))) return [];
    business.names.forEach((n) => seen.add(n.value.trim()));
    return [
      {
        label: `Create draft: ${business.names[0]!.value}`,
        fn: "places:create",
        as: "steward" as const,
        args: {
          regionId: data.regionId,
          kind: "business" as const,
          names: business.names,
          pin: business.pin,
        },
        publicSource: business.publicSource,
        notStored: {
          ...(business.category ? { category: business.category } : {}),
          ...(business.address ? { address: business.address } : {}),
        },
      },
    ];
  });
}
