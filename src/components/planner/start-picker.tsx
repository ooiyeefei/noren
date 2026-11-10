import { MapPin } from "lucide-react";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { plannerMessages } from "@/lib/i18n/messages/planner";
import type { StartChoice } from "@/lib/planner/chat";
import { matchPlaces, type PlaceOption } from "@/lib/planner/start";

export type NearestStatus =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "far" | "denied" | "unavailable" | "timeout" | "unsupported" };

export type StartPickerProps = {
  locale: Locale;
  neighbourhoods: readonly { id: string; names: Readonly<Record<string, string>> }[];
  places: readonly PlaceOption[];
  value: StartChoice | null;
  nearest: NearestStatus;
  placeQuery: string;
  onPlaceQuery(query: string): void;
  onChoose(choice: StartChoice): void;
  onClear(): void;
  onNearest(): void;
};

const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-kon px-4 font-bold text-kon hover:bg-kamenozoki disabled:opacity-50";

/** "English (日本語)": English first, Japanese beside it. */
export function neighbourhoodName(names: Readonly<Record<string, string>>, id: string): string {
  const en = names.en;
  const ja = names.ja;
  if (en && ja && en !== ja) return `${en} (${ja})`;
  return en ?? ja ?? id;
}

export function StartPicker(props: StartPickerProps): React.JSX.Element {
  const { locale, value, nearest } = props;
  const m = messagesFor(plannerMessages, locale);
  const matches = matchPlaces(props.places, props.placeQuery);
  const error =
    nearest.kind === "far"
      ? m.locFar
      : nearest.kind === "denied"
        ? m.locDenied
        : nearest.kind === "unavailable"
          ? m.locUnavailable
          : nearest.kind === "timeout"
            ? m.locTimeout
            : nearest.kind === "unsupported"
              ? m.locUnsupported
              : null;
  return (
    <fieldset className="space-y-4 rounded-[10px] border border-line bg-white p-4">
      <legend className="px-1 font-sans text-[18px] font-bold">{m.startHeading}</legend>

      <div className="space-y-2">
        <button
          type="button"
          className={BUTTON}
          disabled={nearest.kind === "locating"}
          onClick={props.onNearest}
        >
          <MapPin className="size-4" aria-hidden="true" />
          {m.startNearest}
        </button>
        <p className="max-w-prose text-[14px] text-muted-foreground">{m.nearestNote}</p>
        {nearest.kind === "locating" && <p role="status">{m.locating}</p>}
        {error !== null && (
          <p role="alert" className="text-beni">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor="start-neighbourhood" className="block font-bold">
          {m.startNeighbourhoodLabel}
        </label>
        <select
          id="start-neighbourhood"
          className="min-h-11 w-full rounded-[10px] border border-input bg-background px-3 text-base"
          value={value?.kind === "neighbourhood" ? value.id : ""}
          onChange={(event) => {
            const picked = props.neighbourhoods.find((n) => n.id === event.target.value);
            if (picked !== undefined) {
              props.onChoose({
                kind: "neighbourhood",
                id: picked.id,
                name: neighbourhoodName(picked.names, picked.id),
              });
            }
          }}
        >
          <option value="">{m.startNeighbourhoodNone}</option>
          {props.neighbourhoods.map((n) => (
            <option key={n.id} value={n.id}>
              {neighbourhoodName(n.names, n.id)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="start-place" className="block font-bold">
          {m.startPlaceLabel}
        </label>
        <input
          id="start-place"
          type="search"
          autoComplete="off"
          value={props.placeQuery}
          onChange={(event) => props.onPlaceQuery(event.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-input bg-background px-3 text-base"
        />
        {props.placeQuery.trim() !== "" &&
          (matches.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">{m.startNoPlace}</p>
          ) : (
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {matches.map((place) => (
                <li key={place.slug}>
                  <button
                    type="button"
                    className="min-h-11 w-full px-3 py-2 text-left hover:bg-kamenozoki"
                    onClick={() =>
                      props.onChoose({ kind: "place", slug: place.slug, name: place.name })
                    }
                  >
                    {place.name}
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>

      <div className="flex flex-wrap items-center gap-3" aria-live="polite">
        <p className="font-bold">
          {value === null
            ? m.startNone
            : format(
                value.kind === "neighbourhood" ? m.startChosenNeighbourhood : m.startChosenPlace,
                { name: value.name },
              )}
        </p>
        {value !== null && (
          <button type="button" className={BUTTON} onClick={props.onClear}>
            {m.startClear}
          </button>
        )}
      </div>
    </fieldset>
  );
}
