/** A small knot of three overlapping loops, in the text's own colour. Decoration only. */
export function ThreadKnot({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className={className}
    >
      <circle cx="9" cy="10" r="5.5" />
      <circle cx="15" cy="10" r="5.5" />
      <circle cx="12" cy="15" r="5.5" />
    </svg>
  );
}

/** The mark on a kept slip whose thread is tied. */
export function ThreadTiedMark({ label }: { label: string }) {
  return (
    <span data-kept-tied="" className="mt-1 inline-flex items-center gap-1 text-[15px] font-bold">
      <ThreadKnot />
      {label}
    </span>
  );
}
