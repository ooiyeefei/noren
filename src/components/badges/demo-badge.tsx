import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { cn } from "@/lib/utils";
import type { BadgeProps } from "./index";

export function DemoBadge({ locale, className }: BadgeProps): React.JSX.Element {
  const messages = messagesFor(badgeMessages, locale);
  return (
    <Badge
      variant="default"
      className={cn("border-foreground/20 font-semibold", className)}
      data-badge="demo"
      lang={locale}
      title={messages.demoHint}
    >
      {messages.demo}
    </Badge>
  );
}
