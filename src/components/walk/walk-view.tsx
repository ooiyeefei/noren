import { ErrorMessage } from "@/components/layout/error-message";
import { SiteFooter } from "@/components/layout/site-footer";
import type { PublicRegionProps } from "@/components/public/mapping";
import { format, messagesFor, type Locale } from "@/lib/i18n";
import { walkMessages } from "@/lib/i18n/messages/walk";
import type { WalkSnapshot } from "@/lib/walk/controller";
import type { NeighbourhoodLike } from "@/lib/walk/omikuji";
import { WalkCard, type WalkCardActions } from "./walk-card";

export type WalkRegionProps = {
  regionName: string;
  neighbourhoods: NeighbourhoodLike[];
  /** The collection's allowance for the phone's own error (region.collection.accuracyAllowanceMetres). */
  accuracyAllowanceMetres: number;
  /** Cards offer "Ask about this place" (features.planner). */
  planner: boolean;
};

export type WalkActions = WalkCardActions & {
  start(): void;
  stop(): void;
  setSound(on: boolean): void;
  /** The big button that cuts off speech. */
  stopTalking(): void;
};

const BIG_BUTTON =
  "inline-flex min-h-14 w-full items-center justify-center rounded-[10px] bg-kon px-5 py-3 text-[19px] font-bold text-white disabled:opacity-50";
const OUTLINE_BUTTON =
  "inline-flex min-h-14 w-full items-center justify-center rounded-[10px] border-2 border-kon px-5 py-3 text-[19px] font-bold text-kon";

export function WalkView({
  locale,
  region,
  walk,
  snapshot,
  actions,
  omikuji,
}: {
  locale: Locale;
  region: PublicRegionProps;
  walk: WalkRegionProps;
  snapshot: WalkSnapshot;
  actions: WalkActions;
  /** Today's omikuji, which works with or without a walk. */
  omikuji: React.ReactNode;
}) {
  const m = messagesFor(walkMessages, locale);
  const walking = snapshot.phase !== "idle";
  const status =
    snapshot.phase === "loading"
      ? m.starting
      : snapshot.phase === "walking"
        ? snapshot.fixState === "good"
          ? m.statusWalking
          : snapshot.fixState === "rough" && snapshot.fix
            ? format(m.statusRough, { metres: Math.round(snapshot.fix.accuracy) })
            : m.statusFinding
        : null;
  const problem =
    snapshot.problem === "denied"
      ? m.problemDenied
      : snapshot.problem === "unsupported"
        ? m.problemUnsupported
        : null;
  const cardActions: WalkCardActions = actions;
  return (
    <>
      <main
        id="main"
        tabIndex={-1}
        lang={locale}
        className="mx-auto w-full max-w-[720px] min-w-0 flex-1 space-y-5 px-4 py-4 font-sans text-kon sm:py-6"
      >
        <h1 className="text-[28px] font-bold lg:text-4xl">{m.title}</h1>

        <section
          data-walk-desktop=""
          className="hidden space-y-2 rounded-[10px] bg-kamenozoki/60 p-4 pointer-fine:block"
        >
          <h2 className="font-sans text-[20px] font-bold">{m.desktopTitle}</h2>
          <p>{m.desktopBody}</p>
        </section>

        <section data-walk-phone="" aria-label={m.title} className="space-y-4 pointer-fine:hidden">
          <p>{m.lead}</p>
          {walking ? (
            <button
              type="button"
              data-walk-stop=""
              className={OUTLINE_BUTTON}
              onClick={actions.stop}
            >
              {m.stop}
            </button>
          ) : (
            <button type="button" data-walk-start="" className={BIG_BUTTON} onClick={actions.start}>
              {m.start}
            </button>
          )}
          <div role="status" aria-live="polite" className="space-y-1">
            {status && <p className="font-bold">{status}</p>}
            {snapshot.phase === "walking" && (
              <p className="text-[15px] text-muted-foreground">
                {format(m.placesLoaded, { count: snapshot.placeCount.toLocaleString(locale) })}
              </p>
            )}
          </div>
          {problem && (
            <p role="alert" className="font-bold text-beni">
              {problem}
            </p>
          )}
          {snapshot.problem === "load-failed" && (
            <ErrorMessage error={snapshot.loadError} locale={locale} />
          )}
          {snapshot.problem === "load-failed" && <p role="alert">{m.problemLoad}</p>}

          {walking && (snapshot.screen === "refused" || snapshot.screen === "unsupported") && (
            <div
              role="note"
              data-keep-screen-on=""
              className="rounded-[10px] border-2 border-kasutera p-3"
            >
              <p className="font-bold">{m.screenRefused}</p>
              <p>{m.screenRefusedBody}</p>
            </div>
          )}
          {walking && snapshot.screen === "on" && (
            <p className="text-[15px] text-muted-foreground">{m.screenHeld}</p>
          )}

          <div className="space-y-1">
            <button
              type="button"
              data-walk-sound=""
              aria-pressed={snapshot.sound === "on"}
              className={snapshot.sound === "on" ? BIG_BUTTON : OUTLINE_BUTTON}
              onClick={() => actions.setSound(snapshot.sound !== "on")}
            >
              {snapshot.sound === "on" ? m.soundOn : m.soundOff}
            </button>
            <p className="text-[15px] text-muted-foreground">{m.soundHint}</p>
            {snapshot.sound === "on" && snapshot.localVoices === 0 && (
              <p role="note" className="text-[15px]">
                {m.noVoiceAtAll}
              </p>
            )}
          </div>

          <div data-walk-current="" aria-live="polite" aria-label={m.nearYou} className="space-y-4">
            {snapshot.current && (
              <WalkCard
                key={snapshot.current.id}
                locale={locale}
                region={region}
                card={snapshot.current}
                planner={walk.planner}
                localVoices={snapshot.localVoices}
                actions={cardActions}
              />
            )}
          </div>
          {snapshot.earlier.length > 0 && (
            <details className="space-y-3">
              <summary className="min-h-11 cursor-pointer py-2 font-bold text-ai">
                {m.earlier}
              </summary>
              <div className="space-y-4">
                {snapshot.earlier.map((card) => (
                  <WalkCard
                    key={card.id}
                    locale={locale}
                    region={region}
                    card={card}
                    planner={walk.planner}
                    localVoices={snapshot.localVoices}
                    actions={cardActions}
                    compact
                  />
                ))}
              </div>
            </details>
          )}
          {snapshot.speaking && (
            <div className="sticky bottom-3 z-10">
              <button
                type="button"
                data-stop-talking=""
                className={BIG_BUTTON}
                onClick={actions.stopTalking}
              >
                {m.stopTalking}
              </button>
            </div>
          )}
        </section>

        {omikuji}

        <section className="space-y-2 text-[15px] text-muted-foreground">
          <p>{m.iphoneNote}</p>
          <p data-walk-privacy="">{m.privacyLine}</p>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
