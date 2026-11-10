import Link from "next/link";
import { format, localePath, messagesFor, type Locale } from "@/lib/i18n";
import { plannerMessages } from "@/lib/i18n/messages/planner";
import type { ChatState } from "@/lib/planner/chat";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { ReplyView } from "./reply-view";
import { StartPicker, type StartPickerProps } from "./start-picker";

export const MAX_INPUT_CHARS = 600;
const INPUT_ID = "plan-input";

export type PlanViewProps = {
  locale: Locale;
  chat: ChatState;
  input: string;
  onInput(text: string): void;
  onSend(): void;
  picker: StartPickerProps;
  /** What the saved memory will add to the draw, as the visitor's own words. */
  using: { rules: string[]; tastes: string[]; done: string[] };
  ruleLabels: Readonly<Record<string, string>>;
  interestLabel(tag: string): string;
  onAnswer(turnId: string, proposalId: string, answer: "yes" | "no"): void;
  /** The voice input, when the visitor is signed in and speech is on. */
  voice?: React.ReactNode;
};

export function PlanView(props: PlanViewProps): React.JSX.Element {
  const { locale, chat, using } = props;
  const m = messagesFor(plannerMessages, locale);
  const shell = messagesFor(shellMessages, locale);
  const joiner = locale === "ja" ? "、" : ", ";
  const nothingSaved =
    using.rules.length === 0 && using.tastes.length === 0 && using.done.length === 0;
  const examples = [m.example1, m.example2, m.example3];
  return (
    <div className="space-y-6" lang={locale}>
      <p className="max-w-prose text-[17px]">{m.lead}</p>

      <StartPicker {...props.picker} />

      <section
        aria-labelledby="plan-using"
        className="space-y-1 rounded-[10px] bg-kamenozoki p-4 text-[15px]"
      >
        <h2 id="plan-using" className="font-bold">
          {m.usingHeading}
        </h2>
        {nothingSaved ? (
          <p>{m.usingNothing}</p>
        ) : (
          <ul className="space-y-0.5">
            {using.rules.length > 0 && (
              <li>{format(m.usingRules, { list: using.rules.join(joiner) })}</li>
            )}
            {using.tastes.length > 0 && (
              <li>{format(m.usingTastes, { list: using.tastes.join(joiner) })}</li>
            )}
            {using.done.length > 0 && (
              <li>{format(m.usingDone, { list: using.done.join(joiner) })}</li>
            )}
          </ul>
        )}
        <Link
          className="inline-flex min-h-11 items-center font-bold text-ai underline"
          href={localePath(locale, "/remembers")}
        >
          {m.usingEdit}
        </Link>
      </section>

      <div role="log" aria-live="polite" aria-relevant="additions" className="space-y-6">
        {chat.turns.map((turn) => {
          if (turn.role === "user") {
            return (
              <div key={turn.id} className="space-y-1">
                <p className="text-[14px] font-bold text-muted-foreground">{m.you}</p>
                <p className="rounded-[10px] bg-kamenozoki p-3 text-[17px] break-words whitespace-pre-wrap">
                  {turn.text}
                </p>
              </div>
            );
          }
          if (turn.role === "error") {
            return (
              <p key={turn.id} role="alert" className="font-bold text-beni">
                {turn.code === "rate_limited" ? shell.rate_limited : m.errorGeneric}
              </p>
            );
          }
          return (
            <ReplyView
              key={turn.id}
              locale={locale}
              reply={turn.reply}
              proposals={turn.proposals}
              ruleLabels={props.ruleLabels}
              interestLabel={props.interestLabel}
              onAnswer={(proposalId, answer) => props.onAnswer(turn.id, proposalId, answer)}
            />
          );
        })}
        {chat.pending && (
          <p role="status" className="text-muted-foreground">
            {m.sending}
          </p>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSend();
        }}
      >
        <label htmlFor={INPUT_ID} className="block font-sans text-[18px] font-bold">
          {m.inputLabel}
        </label>
        <textarea
          id={INPUT_ID}
          rows={3}
          maxLength={MAX_INPUT_CHARS}
          value={props.input}
          placeholder={m.inputPlaceholder}
          onChange={(event) => props.onInput(event.target.value)}
          className="w-full rounded-[10px] border border-input bg-background px-3 py-2 text-base"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={chat.pending || props.input.trim() === ""}
            className="min-h-11 rounded-[10px] bg-kon px-6 font-bold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ai focus-visible:ring-offset-2"
          >
            {m.send}
          </button>
        </div>
        {props.voice !== undefined && (
          <details className="rounded-[10px] border border-line p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-bold text-ai">
              {m.voiceSummary}
            </summary>
            <div className="space-y-2 pt-2">
              <p className="text-[14px] text-muted-foreground">{m.voiceNote}</p>
              {props.voice}
            </div>
          </details>
        )}
      </form>

      {chat.turns.length === 0 && (
        <section aria-label={m.tryHeading} className="space-y-2">
          <h2 className="font-bold">{m.tryHeading}</h2>
          <ul className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => props.onInput(example)}
                  className="min-h-11 rounded-full border border-dashed border-kon px-4 text-left text-kon hover:bg-kamenozoki"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
