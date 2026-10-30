import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { cn } from "@/lib/utils";
import type { BadgeProps } from "./index";

export function AiAssistedBadge({ locale, className }: BadgeProps): React.JSX.Element {
  const messages = messagesFor(badgeMessages, locale);
  return (
    <Badge
      variant="outline"
      className={cn("bg-muted", className)}
      data-badge="ai-assisted"
      lang={locale}
      title={messages.aiAssistedHint}
    >
      {messages.aiAssisted}
    </Badge>
  );
}
