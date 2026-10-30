/**
 * "What to do here" panel for a signed-in home: a short numbered sequence and the next action.
 * A native <details> so it collapses without script and stays keyboard and screen-reader friendly;
 * pass `done` once the person has taken the first step and it starts collapsed.
 */
export function StepsPanel({
  title,
  steps,
  action,
  done = false,
  lang,
}: {
  title: string;
  steps: readonly string[];
  action?: React.ReactNode;
  done?: boolean;
  lang?: string;
}): React.JSX.Element {
  return (
    <details
      lang={lang}
      open={!done}
      className="group rounded-[14px] border border-line bg-kamenozoki/60 px-5 py-4"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold">
        <span>{title}</span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform duration-150 group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ol className="mt-3 space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-kon text-sm font-bold text-white"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {action && <div className="mt-4">{action}</div>}
    </details>
  );
}
