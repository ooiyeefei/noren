import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { cn } from "@/lib/utils";
import type { BadgeProps } from "./index";

export function UnreviewedBadge({ locale, className }: BadgeProps): React.JSX.Element {
  const messages = messagesFor(badgeMessages, locale);
  return (
    <Badge
      variant="outline"
      className={cn("border-dashed", className)}
      data-badge="unreviewed"
      lang={locale}
      title={messages.unreviewedHint}
    >
      {messages.unreviewed}
    </Badge>
  );
}
