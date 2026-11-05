import { format, messagesFor, type Locale } from "@/lib/i18n";
import { collectionMessages } from "@/lib/i18n/messages/collection";
import { cn } from "@/lib/utils";

export type NorenPanel = { index: number; dyed: boolean; artUrl: string | null };

/** The rod and slits a noren hangs by, around whatever the cloth shows. */
function Cloth({
  panelCount,
  size,
  children,
}: {
  panelCount: number;
  size: "full" | "mini";
  children: React.ReactNode;
}) {
  const full = size === "full";
  return (
    <div className={cn("relative", full ? "pt-3" : "pt-1.5")}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0 rounded-[3px] bg-kon",
          full ? "-inset-x-1.5 h-[5px]" : "-inset-x-[3px] h-[3px]",
        )}
      />
      <div className="relative aspect-[600/420]">
        {children}
        {Array.from({ length: panelCount - 1 }, (_, at) => (
          <span
            key={at}
            aria-hidden="true"
            style={{ left: `${((at + 1) * 100) / panelCount}%` }}
            className={cn(
              "absolute bottom-0 z-[1] h-2/3 -translate-x-1/2 bg-gofun",
              full ? "w-[3px]" : "w-0.5",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A neighbourhood's noren as this person has it: an undyed panel shows none of the picture, and the
 * server sends art only for a panel they have dyed (FR-103). The picture gets its description only
 * once it is whole, so a screen reader can't spoil it either.
 */
export function Noren({
  locale,
  name,
  panels,
  panelCount,
  fresh,
  size = "full",
}: {
  locale: Locale;
  name: string;
  panels: readonly NorenPanel[];
  panelCount: number;
  /** The panel to dye in front of the person, right after they earned it. */
  fresh?: number;
  size?: "full" | "mini";
}) {
  const m = messagesFor(collectionMessages, locale);
  const dyed = panels.filter((panel) => panel.dyed).length;
  const label =
    dyed >= panelCount
      ? format(m.wholeAlt, { name })
      : format(m.progressLabel, { dyed: String(dyed), total: String(panelCount) });
  return (
    <div
      role="img"
      aria-label={label}
      data-noren={dyed}
      className={size === "full" ? "px-1.5" : ""}
    >
      <style>{`
        @keyframes noren-dye {
          from { clip-path: inset(0 0 100% 0); }
          to { clip-path: inset(0 0 0 0); }
        }
        @media (prefers-reduced-motion: no-preference) {
          [data-noren-fresh] { animation: noren-dye 1300ms cubic-bezier(0.3, 0, 0.2, 1) both; }
        }
      `}</style>
      <Cloth panelCount={panelCount} size={size}>
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${panelCount}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: panelCount }, (_, index) => {
            const panel = panels.find((candidate) => candidate.index === index);
            return (
              <div
                key={index}
                data-panel={index}
                data-dyed={panel?.dyed ? "" : undefined}
                className="relative overflow-hidden bg-kamenozoki"
              >
                {panel?.dyed &&
                  (panel.artUrl ? (
                    // The image is one exact slice of the picture, so it needs no resizing service.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={panel.artUrl}
                      alt=""
                      data-noren-fresh={fresh === index ? "" : undefined}
                      className="absolute inset-0 size-full object-fill"
                    />
                  ) : (
                    <span className="absolute inset-0 bg-kon" />
                  ))}
                {!panel?.dyed && size === "full" && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-[42%] text-center font-display text-[22px] font-extrabold text-kon/35"
                  >
                    {index + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Cloth>
    </div>
  );
}

/** The seal on anything finished. */
export function KanSeal({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-[30px] shrink-0 -rotate-6 items-center justify-center rounded-full border-2 border-beni bg-gofun font-display text-base font-extrabold text-beni",
        className,
      )}
    >
      完
    </span>
  );
}

/** A finished noren on the badge shelf, drawn from the picture the badge keeps. */
export function BadgeCloth({
  name,
  locale,
  artUrl,
  panelCount,
}: {
  name: string;
  locale: Locale;
  artUrl: string | null;
  panelCount: number;
}) {
  const m = messagesFor(collectionMessages, locale);
  return (
    <div className="relative">
      <Cloth panelCount={panelCount} size="mini">
        {artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artUrl}
            alt={format(m.wholeAlt, { name })}
            className="absolute inset-0 size-full object-fill"
          />
        ) : (
          <span className="absolute inset-0 bg-kon" />
        )}
      </Cloth>
      <KanSeal className="absolute -right-1.5 -bottom-1.5 z-[2]" />
    </div>
  );
}
