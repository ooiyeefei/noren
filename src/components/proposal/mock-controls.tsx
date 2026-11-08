"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

/**
 * The gift screen's button. It only changes its own words, to show how staff would hand a gift over.
 * Nothing is sent or saved anywhere.
 */
export function GiftButton({
  show,
  mark,
  given,
}: {
  show: string;
  mark: string;
  given: string;
}): React.JSX.Element {
  const [step, setStep] = useState(0);
  return (
    <button
      type="button"
      disabled={step === 2}
      onClick={() => setStep((current) => Math.min(current + 1, 2))}
      className={cn(
        "flex min-h-[50px] w-full items-center justify-center rounded-xl bg-kon px-3.5 py-2 text-center text-[17px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60",
        FOCUS,
      )}
    >
      {step === 0 ? show : step === 1 ? mark : given}
    </button>
  );
}

/** The set builder's reward choice. It only shows which one is picked. */
export function RewardChoice({
  legend,
  choices,
}: {
  legend: string;
  choices: readonly { key: string; label: string }[];
}): React.JSX.Element {
  const [picked, setPicked] = useState(choices[1]?.key ?? choices[0]?.key);
  return (
    <fieldset className="min-w-0 space-y-1 text-sm">
      <legend className="font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            aria-pressed={picked === choice.key}
            onClick={() => setPicked(choice.key)}
            className={cn(
              "min-h-10 rounded-[10px] border px-3 py-1 text-sm",
              picked === choice.key
                ? "border-kon bg-kon text-white"
                : "border-input bg-gofun text-kon",
              FOCUS,
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
