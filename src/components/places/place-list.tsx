import { UnreviewedBadge } from "@/components/badges";
import { DemoBadge } from "@/components/badges/demo-badge";
import { NorenTab } from "@/components/explore/noren-tab";
import { distanceLabel, type Position } from "@/components/explore/helpers";
import { messagesFor, type Locale } from "@/lib/i18n";
import { publicMessages } from "@/lib/i18n/messages/public";
import { placeUiMessages } from "@/lib/i18n/messages/place-ui";

export type PlaceListItem = {
  id: string;
  href: string;
  name: string;
  secondaryName?: string;
  secondaryNameLang?: string;
  kindLabel?: string;
  categoryLabel?: string;
  categoryUnreviewed?: boolean;
  isMock: boolean;
  hasStory?: boolean;
  names?: readonly string[];
  category?: string;
  pin?: Position | null;
  distance?: number;
};

export function PlaceList({
  locale,
  items,
  emptyText,
  selectedId,
  onSelect,
  showUnreviewed = true,
}: {
  locale: Locale;
  items: readonly PlaceListItem[];
  emptyText?: string;
  showUnreviewed?: boolean;
  selectedId?: string | null;
  onSelect?(id: string): void;
}): React.JSX.Element {
  return (
    <div lang={locale}>
      {!items.length && (
        <p className="px-4 py-6 text-muted-foreground">
          {emptyText ?? messagesFor(placeUiMessages, locale).emptyList}
        </p>
      )}
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            id={`explore-place-${item.id}`}
            data-story={Boolean(item.hasStory)}
            className="border-b border-line"
          >
            <a
              href={item.href}
              aria-current={selectedId === item.id ? "true" : undefined}
              className={
                selectedId === item.id
                  ? "flex min-h-16 items-center gap-3 leading-snug bg-kamenozoki px-4 py-3 text-kon"
                  : "flex min-h-16 items-center gap-3 leading-snug px-4 py-3 text-kon hover:bg-kamenozoki"
              }
              onClick={(event) => {
                if (
                  onSelect &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  window.matchMedia("(min-width: 1024px)").matches
                )
                  onSelect(item.id);
              }}
            >
              <NorenTab story={item.hasStory} />
              {item.hasStory && (
                <span className="sr-only">{messagesFor(publicMessages, locale).legendStory}</span>
              )}
              <span className="min-w-0 flex-1 break-words">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{item.name}</span>
                  {item.isMock && <DemoBadge locale={locale} />}
                </span>
                {item.secondaryName && (
                  <span
                    lang={item.secondaryNameLang}
                    className="block text-[13px] text-muted-foreground"
                  >
                    {item.secondaryName}
                  </span>
                )}
              </span>
              <span className="max-w-[38%] shrink-0 text-right text-[13px] text-muted-foreground">
                {item.categoryLabel && <span className="block">{item.categoryLabel}</span>}
                {item.kindLabel && <span className="block">{item.kindLabel}</span>}
                {item.distance !== undefined && (
                  <span className="block">{distanceLabel(item.distance)}</span>
                )}
                {showUnreviewed && item.categoryUnreviewed && <UnreviewedBadge locale={locale} />}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
