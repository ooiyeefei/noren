// Fake phone parts for driving a whole walk in a test: a position source, a screen lock, a speaker
// and a clock. Nothing here touches a browser or the network.
import { vi } from "vitest";
import { walkMessages } from "@/lib/i18n/messages/walk";
import {
  WalkController,
  type SpeechPort,
  type WakeLockPort,
  type WalkPorts,
} from "@/lib/walk/controller";
import type { WalkData, WalkPlace } from "@/lib/walk/types";
import type { VoiceLike } from "@/lib/walk/voice";
import { MINUTE } from "./walk";

export function fakeGeolocation() {
  let onSuccess: PositionCallback | undefined;
  let onFailure: PositionErrorCallback | undefined;
  let watchOptions: PositionOptions | undefined;
  const watchPosition = vi.fn(
    (
      success: PositionCallback,
      failure?: PositionErrorCallback | null,
      options?: PositionOptions,
    ) => {
      onSuccess = success;
      watchOptions = options;
      onFailure = failure ?? undefined;
      return 7;
    },
  );
  const clearWatch = vi.fn();
  return {
    watchPosition,
    clearWatch,
    options: () => watchOptions,
    /** A reading arrives from the phone. */
    emit(lat: number, lng: number, accuracy = 10) {
      onSuccess?.({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition);
    },
    fail(code: number) {
      onFailure?.({ code } as GeolocationPositionError);
    },
  };
}

export function fakeSpeech(voices: VoiceLike[]) {
  let handlers: { onStart(): void; onEnd(): void } | undefined;
  const port = {
    voices: () => voices,
    speak: vi.fn((_items: unknown, h: { onStart(): void; onEnd(): void }) => {
      handlers = h;
      h.onStart();
    }),
    cancel: vi.fn(),
    unlock: vi.fn(),
    onVoicesChanged: vi.fn(() => () => undefined),
  } satisfies SpeechPort;
  return Object.assign(port, { finish: () => handlers?.onEnd() });
}

export function fakeWakeLock(options: { refuse?: boolean } = {}) {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const port: WakeLockPort = {
    request: vi.fn(async () => {
      if (options.refuse) throw new Error("NotAllowedError");
      const sentinel = {
        released: false,
        release: vi.fn(async () => {
          sentinel.released = true;
        }),
      };
      sentinels.push(sentinel);
      return sentinel;
    }),
  };
  return Object.assign(port, { sentinels });
}

export const LOCAL_VOICES: VoiceLike[] = [
  { voiceURI: "en", name: "English", lang: "en-GB", localService: true },
  { voiceURI: "ja", name: "Japanese", lang: "ja-JP", localService: true },
];

export function setup(
  places: WalkPlace[],
  options: {
    voices?: VoiceLike[];
    refuseLock?: boolean;
    noLock?: boolean;
    load?: () => Promise<WalkPlace[]>;
    locale?: "en" | "ja";
  } = {},
) {
  const geolocation = fakeGeolocation();
  const speech = fakeSpeech(options.voices ?? LOCAL_VOICES);
  const wakeLock = fakeWakeLock({ refuse: options.refuseLock });
  let now = 0;
  let visible: (() => void) | undefined;
  const data = {
    loadPlaces: vi.fn(options.load ?? (async () => places)),
    drawToday: vi.fn(async () => ({ day: "2026-11-10", slips: [] })),
  } satisfies WalkData;
  const ports: WalkPorts = {
    data,
    geolocation,
    wakeLock: options.noLock ? undefined : wakeLock,
    speech,
    now: () => now,
    random: () => 0.5,
    onVisible: (callback) => {
      visible = callback;
      return () => {
        visible = undefined;
      };
    },
  };
  const locale = options.locale ?? "en";
  const controller = new WalkController(ports, {
    locale,
    accuracyAllowanceMetres: 30,
    messages: walkMessages[locale],
  });
  return {
    controller,
    geolocation,
    speech,
    wakeLock,
    data,
    /** Moves the clock on. */
    advance: (minutes: number) => {
      now += minutes * MINUTE;
    },
    /** The page comes to the front again. */
    show: () => visible?.(),
    snapshot: () => controller.getSnapshot(),
  };
}

/** Lets the promises a start() has set going settle. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
