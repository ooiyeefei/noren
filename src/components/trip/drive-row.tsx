import { Car } from "lucide-react";
import { directionsUrl } from "@/lib/geo/maps-link";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { tripMessages } from "@/lib/i18n/messages/trip";
import type { Drive } from "@/lib/trip/types";

/** A road point as the page can place it: a name in words and, when the region file has one, a pin. */
export type PointInfo = { name: string; pin?: { lat: number; lng: number } };

const point = (p: { lat: number; lng: number }) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Google Maps directions between two pins. Drives are estimates; the map has the live road. */
export function directionsHref(from: PointInfo, to: PointInfo): string | undefined {
  return to.pin ? directionsUrl(from.pin, to.pin) : undefined;
}

/** Google Maps, showing one pin: for a stop. */
export function pinHref(pin: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${point(pin)}`;
}

/** One drive of the day: where from and to, the estimate, and a way to open it in a maps app (FR-326). */
export function DriveRow({
  locale,
  drive,
  from,
  to,
}: {
  locale: Locale;
  drive: Drive;
  from: PointInfo;
  to: PointInfo;
}): React.JSX.Element {
  const m = messagesFor(tripMessages, locale);
  const href = directionsHref(from, to);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-kamenozoki p-3">
      <Car aria-hidden="true" className="size-5 shrink-0" />
      <div className="min-w-[55%] flex-1">
        <p className="font-bold break-words">{format(m.driveFromTo, { from: from.name, to: to.name })}</p>
        <p className="text-[15px]">
          {format(m.driveEstimate, {
            minutes: Math.round(drive.minutes),
            km: Math.round(drive.kilometres),
          })}
        </p>
      </div>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-ai underline"
        >
          {m.openInMaps}
        </a>
      )}
    </li>
  );
}
