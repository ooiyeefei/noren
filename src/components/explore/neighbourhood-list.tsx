import { format, messagesFor, type Locale } from "@/lib/i18n";
import { missionMessages } from "@/lib/i18n/messages/stamps";
import { MissionBar, neighbourhoodName } from "./mission-bar";

export type NeighbourhoodProgress = {
  id: string;
  names: Readonly<Record<string, string>>;
  center: { lat: number; lng: number };
  radiusMetres: number;
  checked: number;
  left: number;
};

/** The neighbourhoods in the side panel. Pressing one moves the map there. */
export function NeighbourhoodList({
  locale,
  neighbourhoods,
  onChoose,
}: {
  locale: Locale;
  neighbourhoods: readonly NeighbourhoodProgress[];
  onChoose?(neighbourhood: NeighbourhoodProgress): void;
}) {
  const m = messagesFor(missionMessages, locale);
  const shown = neighbourhoods.filter(({ checked, left }) => checked + left > 0);
  if (shown.length === 0) return null;
  return (
    <section data-neighbourhoods="" aria-labelledby="neighbourhoods-heading" className="px-4 pb-3">
      <h2 id="neighbourhoods-heading" className="mb-1 text-[15px] font-bold">
        {m.regionHeading}
      </h2>
      <ul className="grid grid-cols-2 gap-x-3">
        {shown.map((neighbourhood) => {
          const name = neighbourhoodName(neighbourhood.names, locale);
          return (
            <li key={neighbourhood.id} className="min-w-0">
              <button
                type="button"
                data-neighbourhood={neighbourhood.id}
                data-neighbourhood-left={neighbourhood.left}
                aria-label={format(m.showOnMap, { name })}
                onClick={() => onChoose?.(neighbourhood)}
                className="flex min-h-11 w-full min-w-0 flex-col justify-center gap-1 rounded-[6px] py-1 text-left hover:bg-kamenozoki"
              >
                <span className="flex min-w-0 items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-bold">{name}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">
                    {neighbourhood.left === 0
                      ? m.regionDone
                      : format(m.regionLeft, { n: neighbourhood.left })}
                  </span>
                </span>
                <MissionBar
                  checked={neighbourhood.checked}
                  left={neighbourhood.left}
                  label={format(m.progressLabel, { name })}
                  className="h-1.5"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
