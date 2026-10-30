import type { TakedownStatus } from "@/components/takedown/takedown-logic";

export type TakedownRequest = {
  _id: string;
  code?: string;
  placeId?: string;
  placeSlug?: string;
  placeName?: string;
  details: string;
  privacyOrMinor: boolean;
  contact?: string;
  status: TakedownStatus;
  outcome?: string;
  receivedAt: number;
  decidedAt?: number;
  appealNote?: string;
  hiddenPlaceId?: string;
};
export const queueStatuses = ["received", "appealed", "hidden", "decided", "closed"] as const;
export type Windows = { acknowledgeHours: number; decideDays: number };
export function orderQueue(rows: readonly TakedownRequest[]) {
  const priority: Record<TakedownStatus, number> = {
    received: 0,
    appealed: 0,
    hidden: 1,
    decided: 2,
    closed: 3,
  };
  return [...rows].sort(
    (a, b) =>
      priority[a.status] - priority[b.status] ||
      a.receivedAt - b.receivedAt ||
      a._id.localeCompare(b._id),
  );
}
export function ageFlags(
  request: Pick<TakedownRequest, "receivedAt" | "status">,
  now: number,
  windows: Windows,
) {
  const elapsed = Math.max(0, now - request.receivedAt);
  const awaiting = ["received", "hidden", "appealed"].includes(request.status);
  return {
    hours: Math.floor(elapsed / 3600000),
    acknowledgeLate: awaiting && elapsed > windows.acknowledgeHours * 3600000,
    decideLate: awaiting && elapsed > windows.decideDays * 86400000,
  };
}
