import type { Locale } from "@/lib/i18n";
import { placeHeading, type NameLike, type PublicRegionProps } from "@/components/public/mapping";
import { cn } from "@/lib/utils";

export type StampRegion = Pick<PublicRegionProps, "defaultLocale" | "nameFallback">;

/** Long enough for nearly every name; a seal cannot hold more and stay legible. */
const NAME_LIMIT = 24;

/** The name a stamp carries: like the noren, the Japanese one when the place has it. */
export function stampName(names: readonly NameLike[], locale: Locale, region: StampRegion) {
  const japanese = names.filter(
    (name) => name.lang === "ja" && (name.script === "kanji" || name.script === "kana"),
  );
  const chosen = japanese.find((name) => name.isPrimary) ?? japanese[0];
  return chosen
    ? { text: chosen.value, lang: chosen.lang }
    : placeHeading(names, locale, region).primary;
}

/** A small tilt of its own for each place, the same every time, so a page of stamps looks pressed by hand. */
export function stampTilt(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
  return (hash % 9) - 4 || 2;
}

/** The ink's uneven edge and speckle. Render once on a page that shows a stamp. */
export function StampInk() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id="stamp-ink" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          seed="7"
          result="grain"
        />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="1" result="edge" />
        <feColorMatrix
          in="grain"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 2.35"
          result="speckle"
        />
        <feComposite in="edge" in2="speckle" operator="in" />
      </filter>
    </svg>
  );
}

/** A seal's inner height and width in pixels, and the type sizes it wants to stay between. */
const SEAL = {
  large: { box: "h-[168px] w-[120px]", height: 140, width: 96, largest: 34, legible: 22 },
  small: { box: "h-[120px] w-[88px]", height: 92, width: 64, largest: 24, legible: 15 },
};

/** One column when the name stays legible in it, as a hanko is cut; more only when it would not. */
export function sealFontSize(text: string, size: keyof typeof SEAL): number {
  const { height, width, largest, legible } = SEAL[size];
  // Latin letters take about half the height of a kanji when they run down a column.
  const ems = Array.from(text).reduce(
    (total, char) => total + (char.charCodeAt(0) < 0x2e80 ? 0.55 : 1),
    0,
  );
  let fit = 0;
  for (let columns = 1; columns <= 3 && fit < legible; columns++) {
    fit = Math.max(fit, Math.min(height / Math.ceil(ems / columns + 0.5), width / (columns * 1.2)));
  }
  return Math.floor(Math.min(fit, largest));
}

/**
 * A hanko in beni ink: the place's name set vertically inside a double border. It only draws; the
 * caller names the place for a screen reader, so the seal is hidden from one.
 */
export function StampSeal({
  name,
  seed,
  size = "large",
  className,
}: {
  name: { text: string; lang: string };
  seed: string;
  size?: keyof typeof SEAL;
  className?: string;
}) {
  const characters = Array.from(name.text);
  const shown =
    characters.length > NAME_LIMIT ? `${characters.slice(0, NAME_LIMIT - 1).join("")}…` : name.text;
  return (
    <span
      aria-hidden="true"
      lang={name.lang}
      data-stamp-seal=""
      style={{ "--stamp-tilt": `${stampTilt(seed)}deg` } as React.CSSProperties}
      className={cn(
        "inline-flex rotate-[var(--stamp-tilt)] items-center justify-center overflow-hidden rounded-[8px] border-[3px] border-beni p-[3px] text-beni mix-blend-multiply [filter:url(#stamp-ink)]",
        SEAL[size].box,
        className,
      )}
    >
      <span className="flex h-full w-full items-center justify-center rounded-[4px] border border-beni p-1">
        <span
          style={{ fontSize: sealFontSize(shown, size) }}
          className="max-h-full font-display leading-[1.12] font-extrabold [overflow-wrap:anywhere] [text-wrap:balance] [writing-mode:vertical-rl]"
        >
          {shown}
        </span>
      </span>
    </span>
  );
}
