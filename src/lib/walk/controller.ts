import type { Rng } from "@/lib/draw";
import type { Locale } from "@/lib/i18n";
import type { WalkMessageTable } from "@/lib/i18n/messages/walk";
import { EARLIER_CARDS_KEPT } from "./constants";
import {
  dismissed,
  newMemory,
  step,
  type CardKind,
  type WalkEvent,
  type WalkMemory,
} from "./engine";
import { narrate, type Narration } from "./narration";
import { isUsableFix } from "./proximity";
import type { Fix, WalkData, WalkPlace } from "./types";
import { planSpeech, type VoiceLike } from "./voice";

// A walk, start to stop. The controller owns the phone's side of it: the position watch, the screen
// lock and the speaker. It talks to Noren only through `data`, which is given nothing but the
// region (see convex-data.ts); a reading from the phone goes into `step` and the screen, and into
// no function that leaves the phone. Every outside thing is a port, so a test drives a whole walk
// with fake positions, a fake clock and a fake speaker.

export type SpeechPort = {
  /** The voices on the phone, local or not; the planner keeps the local ones. */
  voices(): readonly VoiceLike[];
  /** Says the pieces one after the other. `onEnd` fires once, when the last ends or it is cut off. */
  speak(
    items: readonly { text: string; lang: string; voice: VoiceLike }[],
    handlers: { onStart(): void; onEnd(): void },
  ): void;
  cancel(): void;
  /** Called in a tap, so a phone that only speaks after a tap lets later speech through. */
  unlock(): void;
  onVoicesChanged(callback: () => void): () => void;
};

export type WakeLockPort = {
  request(): Promise<{ readonly released: boolean; release(): Promise<void> }>;
};

export type WalkPorts = {
  data: WalkData;
  geolocation: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined;
  wakeLock: WakeLockPort | undefined;
  speech: SpeechPort | undefined;
  now(): number;
  random: Rng;
  /** Calls back when the page comes to the front again. */
  onVisible(callback: () => void): () => void;
};

export type WalkConfig = {
  locale: Locale;
  accuracyAllowanceMetres: number;
  messages: WalkMessageTable;
};

export type Card = {
  id: number;
  kind: CardKind;
  place: WalkPlace;
  metres: number;
  minutes?: number;
  at: number;
};

export type CardView = Card & {
  /** What a story card says; null when the place has a story but no words to show. */
  narration: Narration | null;
  /** Whether this phone can read the words: with a local voice for every part, or why not. */
  voice: { ok: true } | { ok: false; missing: string[] };
};

export type WalkSnapshot = {
  phase: "idle" | "loading" | "walking";
  problem: "denied" | "unsupported" | "load-failed" | null;
  loadError: unknown;
  /** The latest reading. It is shown to its owner and used on the phone; it is never sent. */
  fix: Fix | null;
  fixState: "waiting" | "rough" | "good";
  screen: "off" | "on" | "refused" | "unsupported";
  sound: "off" | "on";
  speaking: boolean;
  /** Local voices on the phone, so the page can say when there are none. */
  localVoices: number;
  placeCount: number;
  current: CardView | null;
  earlier: CardView[];
};

const INITIAL: WalkSnapshot = {
  phase: "idle",
  problem: null,
  loadError: null,
  fix: null,
  fixState: "waiting",
  screen: "off",
  sound: "off",
  speaking: false,
  localVoices: 0,
  placeCount: 0,
  current: null,
  earlier: [],
};

const PERMISSION_DENIED = 1;

export class WalkController {
  private state: WalkSnapshot = INITIAL;
  private cards: { current: Card | null; earlier: Card[] } = { current: null, earlier: [] };
  private listeners = new Set<() => void>();
  private memory: WalkMemory = newMemory(0);
  private places: WalkPlace[] = [];
  private watchId: number | null = null;
  private lock: { readonly released: boolean; release(): Promise<void> } | null = null;
  private latest: Fix | null = null;
  private session = 0;
  private nextId = 1;
  /** Undoes for what one walk set up (the visibility listener). */
  private walkCleanups: (() => void)[] = [];
  private stopListeningForVoices: (() => void) | null = null;

  constructor(
    private readonly ports: WalkPorts,
    private readonly config: WalkConfig,
  ) {}

  // useSyncExternalStore. The controller listens for voices only while something is listening to it.
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1)
      this.stopListeningForVoices = this.ports.speech?.onVoicesChanged(() => this.emit({})) ?? null;
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopListeningForVoices?.();
        this.stopListeningForVoices = null;
      }
    };
  };
  getSnapshot = (): WalkSnapshot => this.state;

  private emit(patch: Partial<WalkSnapshot>) {
    const localVoices = (this.ports.speech?.voices() ?? []).filter(
      (voice) => voice.localService === true,
    ).length;
    this.state = {
      ...this.state,
      ...patch,
      localVoices,
      current: this.cards.current && this.view(this.cards.current),
      earlier: this.cards.earlier.map((card) => this.view(card)),
    };
    for (const listener of this.listeners) listener();
  }

  private view(card: Card): CardView {
    const snippet = card.place.snippet;
    const narration =
      card.kind === "story" && snippet !== undefined
        ? narrate(snippet, this.config.locale, this.config.messages)
        : null;
    const plan =
      narration === null ? null : planSpeech(narration.parts, this.ports.speech?.voices() ?? []);
    return {
      ...card,
      narration,
      voice: plan?.ok
        ? { ok: true }
        : { ok: false, missing: plan?.ok === false ? plan.missing : [] },
    };
  }

  // --- the walk ---

  async start(): Promise<void> {
    if (this.state.phase !== "idle") return;
    const session = ++this.session;
    const { geolocation } = this.ports;
    if (geolocation === undefined) {
      this.emit({ problem: "unsupported" });
      return;
    }
    this.memory = newMemory(this.ports.now());
    this.places = [];
    this.latest = null;
    this.cards = { current: null, earlier: [] };
    this.emit({
      phase: "loading",
      problem: null,
      loadError: null,
      fix: null,
      fixState: "waiting",
      screen: "off",
      speaking: false,
      placeCount: 0,
    });
    // The watch starts here, in the tap, so the browser asks for permission now.
    this.watchId = geolocation.watchPosition(
      (position) => this.onFix(session, position.coords),
      (error) => this.onPositionError(session, error.code),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
    );
    this.walkCleanups.push(this.ports.onVisible(() => void this.holdScreen(this.session)));
    void this.holdScreen(session);
    try {
      const places = await this.ports.data.loadPlaces();
      if (session !== this.session) return;
      this.places = places;
      this.emit({ phase: "walking", placeCount: places.length });
      if (this.latest !== null) this.process(this.latest);
    } catch (error) {
      if (session !== this.session) return;
      this.release();
      this.emit({ phase: "idle", problem: "load-failed", loadError: error, screen: "off" });
    }
  }

  stop(): void {
    if (this.state.phase === "idle") return;
    this.release();
    this.archiveCurrent();
    this.emit({
      phase: "idle",
      fix: null,
      fixState: "waiting",
      screen: "off",
      speaking: false,
    });
  }

  /** Lets go of the watch, the screen lock and the speaker. Safe to call twice. */
  private release() {
    this.session++;
    if (this.watchId !== null) this.ports.geolocation?.clearWatch(this.watchId);
    this.watchId = null;
    const lock = this.lock;
    this.lock = null;
    if (lock !== null && !lock.released) lock.release().catch(() => undefined);
    this.ports.speech?.cancel();
    for (const cleanup of this.walkCleanups.splice(0)) cleanup();
    this.latest = null;
  }

  /** Call when the page goes away: lets go of everything a walk holds. */
  dispose(): void {
    this.stop();
  }

  private async holdScreen(session: number) {
    if (session !== this.session || this.state.phase === "idle") return;
    if (this.lock !== null && !this.lock.released) return;
    const { wakeLock } = this.ports;
    if (wakeLock === undefined) {
      this.emit({ screen: "unsupported" });
      return;
    }
    try {
      const lock = await wakeLock.request();
      if (session !== this.session) {
        lock.release().catch(() => undefined);
        return;
      }
      this.lock = lock;
      this.emit({ screen: "on" });
    } catch {
      // A phone may refuse (low battery, a setting). The walk carries on and asks the person.
      if (session === this.session) this.emit({ screen: "refused" });
    }
  }

  // --- the phone's position ---

  private onFix(
    session: number,
    coords: { latitude: number; longitude: number; accuracy: number },
  ) {
    // A reading from a watch that has been let go (a late callback) is dropped.
    if (session !== this.session) return;
    const fix: Fix = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
    this.latest = fix;
    this.emit({ fix, fixState: isUsableFix(fix) ? "good" : "rough" });
    if (this.state.phase === "walking") this.process(fix);
  }

  private onPositionError(session: number, code: number) {
    if (session !== this.session) return;
    if (code === PERMISSION_DENIED) {
      this.release();
      this.emit({ phase: "idle", problem: "denied", fix: null, screen: "off" });
      return;
    }
    // Unavailable or timed out: the watch keeps trying.
    this.emit({ fixState: "waiting" });
  }

  private process(fix: Fix) {
    const result = step({
      memory: this.memory,
      fix,
      now: this.ports.now(),
      places: this.places,
      accuracyAllowanceMetres: this.config.accuracyAllowanceMetres,
      soundOn: this.state.sound === "on",
      canSpeak: (place) => this.canRead(place),
      rng: this.ports.random,
    });
    this.memory = result.memory;
    if (result.slotCleared) this.archiveCurrent();
    if (result.event === null) {
      if (result.slotCleared) this.emit({});
      return;
    }
    this.show(result.event);
  }

  private show(event: WalkEvent) {
    this.archiveCurrent();
    const card: Card = {
      id: this.nextId++,
      kind: event.kind,
      place: event.place,
      metres: Math.round(event.metres),
      ...(event.kind === "detour" ? { minutes: event.minutes } : {}),
      at: this.ports.now(),
    };
    this.cards.current = card;
    this.emit({});
    if (event.kind === "story" && event.speak) this.read(card);
  }

  private archiveCurrent() {
    const { current } = this.cards;
    if (current === null) return;
    this.cards = {
      current: null,
      earlier: [current, ...this.cards.earlier].slice(0, EARLIER_CARDS_KEPT),
    };
  }

  // --- the person's taps ---

  /** The person closed the card. */
  dismiss(): void {
    this.memory = dismissed(this.memory);
    this.archiveCurrent();
    this.emit({});
  }

  /** Turning sound on happens in a tap, which is what lets a phone speak later without one. */
  setSound(on: boolean): void {
    if (on) this.ports.speech?.unlock();
    else {
      this.ports.speech?.cancel();
    }
    this.emit({ sound: on ? "on" : "off", ...(on ? {} : { speaking: false }) });
  }

  /** "Read aloud" on a card. A press is the person's own wish, so the spacing rule does not apply. */
  readAloud(cardId: number): void {
    const all = [this.cards.current, ...this.cards.earlier];
    const card = all.find((candidate) => candidate?.id === cardId);
    if (card) this.read(card);
  }

  stopTalking(): void {
    this.ports.speech?.cancel();
    this.emit({ speaking: false });
  }

  // --- speech ---

  private canRead(place: WalkPlace): boolean {
    const snippet = place.snippet;
    if (snippet === undefined || this.ports.speech === undefined) return false;
    const narration = narrate(snippet, this.config.locale, this.config.messages);
    return planSpeech(narration.parts, this.ports.speech.voices()).ok;
  }

  private read(card: Card) {
    const speech = this.ports.speech;
    const snippet = card.place.snippet;
    if (speech === undefined || snippet === undefined) return;
    const narration = narrate(snippet, this.config.locale, this.config.messages);
    const plan = planSpeech(narration.parts, speech.voices());
    if (!plan.ok) return;
    speech.cancel();
    speech.speak(plan.items, {
      onStart: () => this.emit({ speaking: true }),
      onEnd: () => this.emit({ speaking: false }),
    });
  }
}
