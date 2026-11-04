import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function neighbourhoodName(names: Readonly<Record<string, string>>, locale: Locale): string {
  return names[locale] ?? Object.values(names)[0] ?? "";
}

/** A neighbourhood's progress. A sliver always shows once anyone has checked a place. */
export function MissionBar({
  checked,
  left,
  label,
  className,
}: {
  checked: number;
  left: number;
  label: string;
  className?: string;
}) {
  const total = checked + left;
  const percent = total === 0 ? 0 : (checked / total) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={checked}
      data-mission-bar=""
      className={cn("w-full overflow-hidden rounded-full bg-kamenozoki", className)}
    >
      <div
        className="h-full rounded-full bg-beni transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: checked > 0 ? `max(${percent}%, 4px)` : "0" }}
      />
    </div>
  );
}
