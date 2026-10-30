import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { cn } from "@/lib/utils";
import type { BadgeProps } from "./index";

export function MachineTranslationBadge({ locale, className }: BadgeProps): React.JSX.Element {
  const messages = messagesFor(badgeMessages, locale);
  return (
    <Badge
      variant="secondary"
      className={cn("border-border", className)}
      data-badge="machine-translation"
      lang={locale}
      title={messages.machineTranslationHint}
    >
      {messages.machineTranslation}
    </Badge>
  );
}
