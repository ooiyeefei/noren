import { Badge } from "@/components/ui/badge";
import { messagesFor } from "@/lib/i18n";
import { badgeMessages } from "@/lib/i18n/messages/badges";
import { cn } from "@/lib/utils";
import type { BadgeProps } from "./index";

export function TranslationReviewBadge({ locale, className }: BadgeProps): React.JSX.Element {
  const messages = messagesFor(badgeMessages, locale);
  return (
    <Badge
      variant="outline"
      className={cn("text-muted-foreground", className)}
      data-badge="translation-under-review"
      lang={locale}
      title={messages.translationUnderReviewHint}
    >
      {messages.translationUnderReview}
    </Badge>
  );
}
