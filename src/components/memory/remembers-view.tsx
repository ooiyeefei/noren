import Link from "next/link";
import { normaliseTag } from "@/lib/draw/rules";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { remembersMessages } from "@/lib/i18n/messages/remembers";
import {
  RULE_PRESETS,
  TASTE_PRESETS,
  ruleLabel,
  tasteLabel,
  tastesNow,
  type Memory,
} from "@/lib/memory";
import { MAX_RULES } from "@/lib/memory/constants";
import { AddForm, Chip, RemoveButton, fillField } from "./chip";

// "What Noren remembers". Everything here is drawn from the memory object it is given and calls
// the handlers it is given, so it holds no state of its own: the container wires it to the device.

const RULE_FIELD = "remember-rule";
const TASTE_FIELD = "remember-taste";
const TRIP_FIELD = "remember-trip";

const QUICK =
  "min-h-11 rounded-full border border-dashed border-kon px-4 text-kon hover:bg-kamenozoki";

export type RemembersViewProps = {
  locale: Locale;
  memory: Memory;
  now: number;
  /** Hard-rule tags the draw can really check (src/lib/planner/checkable.ts). */
  checkable: readonly string[];
  /** False where the browser will not keep anything. */
  canKeep: boolean;
  /** Set once the visitor has just forgotten everything. */
  forgotten?: boolean;
  /** The voice input for one field, when the visitor is signed in. */
  voice?: (fieldId: string) => React.ReactNode;
  onAddRule(text: string): void;
  onRemoveRule(id: string): void;
  onAddTaste(text: string): void;
  onRemoveTaste(key: string): void;
  onAddVisited(text: string): void;
  onRemoveVisited(id: string): void;
  onKeepVisited(id: string, kept: boolean): void;
  onForgetAll(): void;
};

function Voice({
  render,
  id,
  summary,
}: {
  render?: RemembersViewProps["voice"];
  id: string;
  summary: string;
}) {
  const node = render?.(id);
  if (!node) return null;
  return (
    <details className="rounded-[10px] border border-line p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-bold text-ai">{summary}</summary>
      <div className="pt-2">{node}</div>
    </details>
  );
}

export function RemembersView(props: RemembersViewProps): React.JSX.Element {
  const { locale, memory, now, checkable } = props;
  const m = messagesFor(remembersMessages, locale);
  const checkableSet = new Set(checkable);
  const have = new Set(memory.rules.map((rule) => rule.tag));
  const tastes = tastesNow(memory, now);
  const toldTastes = new Set(memory.tastes.filter((taste) => taste.told).map((t) => t.key));
  const rulesFull = memory.rules.length >= MAX_RULES;
  const section = "space-y-4 border-t border-line pt-6 first:border-t-0 first:pt-0";
  return (
    <div className="space-y-8" lang={locale}>
      <p className="max-w-prose text-[17px]">{m.lead}</p>

      <section
        aria-labelledby="remember-privacy"
        className="space-y-2 rounded-[10px] bg-kamenozoki p-4"
      >
        <h2 id="remember-privacy" className="font-sans text-[18px] font-bold">
          {m.privacyHeading}
        </h2>
        <p className="max-w-prose text-[15px]">{m.privacyBody}</p>
        {!props.canKeep && (
          <p role="alert" className="text-[15px] font-bold text-beni">
            {m.cantKeep}
          </p>
        )}
      </section>

      <section aria-labelledby="remember-rules" className={section}>
        <h2 id="remember-rules" className="font-sans text-[22px] font-bold">
          {m.rulesHeading}
        </h2>
        <p className="max-w-prose text-[15px] text-muted-foreground">{m.rulesNote}</p>
        {memory.rules.length === 0 ? (
          <p className="text-muted-foreground">{m.rulesEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label={m.rulesHeading}>
            {memory.rules.map((rule) => {
              const label = ruleLabel(rule, locale, m.allergyPrefix);
              return (
                <Chip
                  key={rule.id}
                  label={label}
                  note={checkableSet.has(normaliseTag(rule.tag)) ? m.canCheck : m.cannotCheck}
                  removeLabel={format(m.remove, { label })}
                  onRemove={() => props.onRemoveRule(rule.id)}
                />
              );
            })}
          </ul>
        )}
        {rulesFull && <p className="text-[15px]">{format(m.rulesFull, { max: MAX_RULES })}</p>}
        {!rulesFull && (
          <>
            <div className="space-y-2">
              <p className="font-bold">{m.quickAdd}</p>
              <ul className="flex flex-wrap gap-2">
                {RULE_PRESETS.filter((preset) => !have.has(preset.tag)).map((preset) => (
                  <li key={preset.key}>
                    <button
                      type="button"
                      className={QUICK}
                      onClick={() => props.onAddRule(preset.label.en)}
                    >
                      + {preset.label[locale]}
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={QUICK}
                    onClick={() => fillField(RULE_FIELD, m.allergyStart)}
                  >
                    + {m.allergyChip}
                  </button>
                </li>
              </ul>
            </div>
            <AddForm
              id={RULE_FIELD}
              label={m.addRuleLabel}
              help={m.addRuleHelp}
              addLabel={m.add}
              onAdd={props.onAddRule}
            />
            <Voice render={props.voice} id={RULE_FIELD} summary={m.voiceSummary} />
          </>
        )}
      </section>

      <section aria-labelledby="remember-tastes" className={section}>
        <h2 id="remember-tastes" className="font-sans text-[22px] font-bold">
          {m.tastesHeading}
        </h2>
        <p className="max-w-prose text-[15px] text-muted-foreground">{m.tastesNote}</p>
        {tastes.length === 0 ? (
          <p className="text-muted-foreground">{m.tastesEmpty}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" aria-label={m.tastesHeading}>
            {tastes.map((taste) => {
              const label = tasteLabel(taste, locale);
              return (
                <Chip
                  key={taste.key}
                  label={label}
                  note={taste.told ? m.tasteTold : m.tasteNoticed}
                  removeLabel={format(m.remove, { label })}
                  onRemove={() => props.onRemoveTaste(taste.key)}
                />
              );
            })}
          </ul>
        )}
        <div className="space-y-2">
          <p className="font-bold">{m.quickAdd}</p>
          <ul className="flex flex-wrap gap-2">
            {TASTE_PRESETS.filter((preset) => !toldTastes.has(preset.key)).map((preset) => (
              <li key={preset.key}>
                <button
                  type="button"
                  className={QUICK}
                  onClick={() => props.onAddTaste(preset.key)}
                >
                  + {preset.label[locale]}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <AddForm
          id={TASTE_FIELD}
          label={m.addTasteLabel}
          help={m.addTasteHelp}
          addLabel={m.add}
          onAdd={props.onAddTaste}
        />
        <Voice render={props.voice} id={TASTE_FIELD} summary={m.voiceSummary} />
      </section>

      <section aria-labelledby="remember-trip" className={section}>
        <h2 id="remember-trip" className="font-sans text-[22px] font-bold">
          {m.tripHeading}
        </h2>
        <p className="max-w-prose text-[15px] text-muted-foreground">{m.tripNote}</p>
        {memory.trip.items.length === 0 ? (
          <p className="text-muted-foreground">{m.tripEmpty}</p>
        ) : (
          <ul className="space-y-2" aria-label={m.tripHeading}>
            {memory.trip.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-line bg-white py-1 pr-1 pl-4"
              >
                <span className="min-w-0 flex-1 break-words font-bold text-kon">
                  {item.slug ? (
                    <Link className="underline" href={localePath(locale, `/places/${item.slug}`)}>
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </span>
                <button
                  type="button"
                  aria-pressed={item.kept}
                  onClick={() => props.onKeepVisited(item.id, !item.kept)}
                  className={`min-h-11 rounded-full px-4 text-[15px] font-bold ${item.kept ? "bg-kon text-white" : "border border-kon text-kon"}`}
                >
                  {item.kept ? m.keptAfterToday : m.keepAfterToday}
                </button>
                <RemoveButton
                  label={format(m.remove, { label: item.label })}
                  onRemove={() => props.onRemoveVisited(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
        <AddForm
          id={TRIP_FIELD}
          label={m.addTripLabel}
          help={m.addTripHelp}
          addLabel={m.add}
          onAdd={props.onAddVisited}
        />
        <Voice render={props.voice} id={TRIP_FIELD} summary={m.voiceSummary} />
      </section>

      <section aria-labelledby="remember-forget" className={section}>
        <h2 id="remember-forget" className="font-sans text-[22px] font-bold">
          {m.forgetHeading}
        </h2>
        <p className="max-w-prose text-[15px] text-muted-foreground">{m.forgetBody}</p>
        <details className="rounded-[10px] border border-beni p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-bold text-beni">
            {m.forgetButton}
          </summary>
          <div className="space-y-3 pt-2">
            <p className="font-bold">{m.forgetConfirm}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={props.onForgetAll}
                className="min-h-11 rounded-[10px] bg-beni px-4 font-bold text-white"
              >
                {m.forgetYes}
              </button>
              <button
                type="button"
                onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                className="min-h-11 rounded-[10px] border border-kon px-4 font-bold text-kon"
              >
                {m.forgetNo}
              </button>
            </div>
          </div>
        </details>
        <div role="status" aria-live="polite">
          {props.forgotten ? m.forgotten : null}
        </div>
      </section>

      <p>
        <Link
          className="inline-flex min-h-11 items-center font-bold text-ai underline"
          href={localePath(locale, "/plan")}
        >
          {m.planLink}
        </Link>
      </p>
    </div>
  );
}
