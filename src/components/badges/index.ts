import type { Locale } from "@/lib/i18n";

export type BadgeProps = { locale: Locale; className?: string };

export { DemoBadge } from "./demo-badge";
export { MachineTranslationBadge } from "./machine-translation-badge";
export { UnreviewedBadge } from "./unreviewed-badge";
export { AiAssistedBadge } from "./ai-assisted-badge";
export { TranslationPendingBadge } from "./translation-pending-badge";
