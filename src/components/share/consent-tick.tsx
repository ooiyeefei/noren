import { messagesFor, type Locale } from "@/lib/i18n";
import { shareMessages } from "@/lib/i18n/messages/share";

/**
 * The writer's own choice, off until ticked: Noren may feature the story on its own accounts, with
 * their name. The form shows it only while the region offers it. It is never kept through a reload.
 */
export function ConsentTick({
  locale,
  hintId,
  checked,
  onChange,
}: {
  locale: Locale;
  hintId: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  const m = messagesFor(shareMessages, locale);
  return (
    <div className="space-y-1">
      <label className="flex min-h-11 items-center gap-2 font-bold">
        <input
          type="checkbox"
          data-testid="share-consent"
          checked={checked}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.checked)}
          className="size-5"
        />
        {m.consentTick}
      </label>
      <p id={hintId} className="text-[15px] text-muted-foreground">
        {m.consentHint}
      </p>
    </div>
  );
}
