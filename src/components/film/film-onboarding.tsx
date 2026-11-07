"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Play, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { messagesFor, type Locale } from "@/lib/i18n";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { api } from "../../../convex/_generated/api";
import { FilmPlayer } from "./film-player";

const HINT_SECONDS = 8;
/** Pages where the film is already on screen, or the person is reading or signing in. */
const NO_POP_UP = new Set(["welcome", "sign-in", "sign-up", "terms", "privacy"]);

/**
 * Whether the film may open by itself on this page. Someone who signed in to write a story came to
 * write, so the film waits for their next page. The button still works everywhere.
 */
export function filmMayOpenHere(pathname: string | null, write: string | null): boolean {
  if (write === "1") return false;
  const page = pathname?.split("/")[2];
  return page === undefined || !NO_POP_UP.has(page);
}

export function FilmOnboardingView({
  locale,
  open,
  hint,
  onWatch,
  onClose,
  button,
}: {
  locale: Locale;
  open: boolean;
  hint: boolean;
  onWatch: () => void;
  onClose: () => void;
  button?: RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  const m = messagesFor(shellMessages, locale);
  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={m.filmButtonLabel}
        aria-haspopup="dialog"
        onClick={onWatch}
        className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-line text-sm text-kon hover:bg-kamenozoki focus-visible:ring-2 focus-visible:ring-ai focus-visible:outline-none sm:px-3"
      >
        <Play aria-hidden className="size-4 fill-current" />
        <span className="hidden sm:inline">{m.filmButton}</span>
      </button>
      {hint && (
        <p
          role="status"
          className="absolute top-full right-0 z-40 mt-2 w-max max-w-56 rounded-[10px] bg-kon px-3 py-2 text-sm text-white shadow-md"
        >
          {m.filmHint}
        </p>
      )}
      <Dialog open={open} onOpenChange={(next) => (next ? onWatch() : onClose())}>
        <DialogContent
          lang={locale}
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            button?.current?.focus();
          }}
          className="max-h-[92dvh] gap-3 overflow-y-auto p-4 sm:max-w-[760px] sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="font-sans text-[22px] leading-snug font-bold text-kon">
                {m.filmTitle}
              </DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed">
                {m.filmLead}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <button
                type="button"
                aria-label={m.filmClose}
                className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-kon hover:bg-kamenozoki focus-visible:ring-2 focus-visible:ring-ai focus-visible:outline-none"
              >
                <X aria-hidden className="size-5" />
              </button>
            </DialogClose>
          </div>
          <FilmPlayer locale={locale} className="max-h-[70dvh]" />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The welcome film for a signed-in member. It opens by itself until they close it once, on any
 * device, and a button beside their account keeps it a tap away after that.
 */
export function FilmOnboarding({ locale }: { locale: Locale }): React.JSX.Element | null {
  const pathname = usePathname();
  const write = useSearchParams().get("write");
  const { isAuthenticated } = useConvexAuth();
  const person = useQuery(api.people.current, isAuthenticated ? {} : "skip");
  const markSeen = useMutation(api.people.markFilmSeen);
  const [watching, setWatching] = useState(false);
  const [closed, setClosed] = useState(false);
  const [hint, setHint] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [hint]);
  if (!isAuthenticated || !person) return null;
  const firstTime = !person.filmSeen && !closed;
  return (
    <FilmOnboardingView
      locale={locale}
      open={watching || (firstTime && filmMayOpenHere(pathname, write))}
      hint={hint}
      button={button}
      onWatch={() => {
        setHint(false);
        setWatching(true);
      }}
      onClose={() => {
        setWatching(false);
        setClosed(true);
        if (!firstTime) return;
        setHint(true);
        markSeen().catch((error: unknown) => {
          // It simply opens once more next time, so no one needs to see this.
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          console.error(`people.markFilmSeen failed (${detail})`);
        });
      }}
    />
  );
}
