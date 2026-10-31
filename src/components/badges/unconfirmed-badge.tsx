import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { cn } from "@/lib/utils";
import type { BadgeProps } from "./index";

/** An open-data listing no person has checked yet (FR-030). */
export function UnconfirmedBadge({ locale, className }: BadgeProps): React.JSX.Element {
  const messages = messagesFor(badgeMessages, locale);
  return (
    <Badge
      variant="outline"
      className={cn("border-dashed", className)}
      data-badge="unconfirmed"
      lang={locale}
      title={messages.unconfirmedHint}
    >
      {messages.unconfirmed}
    </Badge>
  );
}
