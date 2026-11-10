import { afterEach, describe, expect, it, vi } from "vitest";
import type { WalkPlace } from "@/lib/walk/types";
import { ORIGIN, fixAt, northOf, walkPlace } from "../fixtures/walk";
import { LOCAL_VOICES, settle, setup } from "../fixtures/walk-ports";

afterEach(() => vi.restoreAllMocks());

const story = (slug = "kenjis", over: Partial<WalkPlace> = {}) =>
  walkPlace(slug, ORIGIN, { story: true, ...over });

describe("starting and stopping a walk", () => {
  it("watches the position, holds the screen and downloads the places once", async () => {
    const t = setup([story()]);
    expect(t.snapshot().phase).toBe("idle");
    const started = t.controller.start();
    expect(t.snapshot().phase).toBe("loading");
    // The position watch begins in the tap itself, so the browser asks for permission then.
    expect(t.geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(t.geolocation.options()).toMatchObject({
      enableHighAccuracy: true,
    });
    await started;
    await settle();
    expect(t.snapshot()).toMatchObject({ phase: "walking", placeCount: 1, screen: "on" });
    expect(t.wakeLock.request).toHaveBeenCalledTimes(1);
    // Many readings later the places are still downloaded just once.
    for (let i = 0; i < 20; i++) t.geolocation.emit(northOf(ORIGIN, 500 + i).lat, ORIGIN.lng);
    expect(t.data.loadPlaces).toHaveBeenCalledTimes(1);
    expect(t.data.loadPlaces).toHaveBeenCalledWith();
  });

  it("uses readings that arrive before the places are in", async () => {
    let finish!: (places: WalkPlace[]) => void;
    const t = setup([], { load: () => new Promise((resolve) => (finish = resolve)) });
    void t.controller.start();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().current).toBeNull();
    finish([story()]);
    await settle();
    expect(t.snapshot().current).toMatchObject({ kind: "story", place: { slug: "kenjis" } });
  });

  it("lets everything go on stop, and forgets where the phone was", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().fix).not.toBeNull();
    t.controller.stop();
    expect(t.geolocation.clearWatch).toHaveBeenCalledWith(7);
    expect(t.wakeLock.sentinels[0]!.release).toHaveBeenCalledTimes(1);
    expect(t.speech.cancel).toHaveBeenCalled();
    expect(t.snapshot()).toMatchObject({
      phase: "idle",
      fix: null,
      screen: "off",
      speaking: false,
      current: null,
    });
    // The card that was showing is kept to look back on; the position is not.
    expect(t.snapshot().earlier).toHaveLength(1);
    // Readings that still arrive after stop do nothing.
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().fix).toBeNull();
  });

  it("ignores places that arrive after stop, and starts again cleanly", async () => {
    let finish!: (places: WalkPlace[]) => void;
    const t = setup([story()], { load: () => new Promise((resolve) => (finish = resolve)) });
    void t.controller.start();
    t.controller.stop();
    finish([story()]);
    await settle();
    expect(t.snapshot().phase).toBe("idle");
    expect(t.wakeLock.sentinels.every((sentinel) => sentinel.released)).toBe(true);
  });

  it("starts a second walk with nothing left over from the first", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    t.controller.stop();
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    // A new walk: the place has not been seen on it yet.
    expect(t.snapshot().current).toMatchObject({ kind: "story" });
    expect(t.data.loadPlaces).toHaveBeenCalledTimes(2);
  });

  it("carries on when the phone refuses to hold the screen, and says to keep it on", async () => {
    const t = setup([story()], { refuseLock: true });
    await t.controller.start();
    await settle();
    expect(t.snapshot()).toMatchObject({ phase: "walking", screen: "refused" });
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().current?.kind).toBe("story");
  });

  it("says so when the browser has no screen lock at all", async () => {
    const t = setup([story()], { noLock: true });
    await t.controller.start();
    await settle();
    expect(t.snapshot().screen).toBe("unsupported");
  });

  it("asks for the screen lock again when the page comes back to the front", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    // The browser let the first lock go while the page was hidden.
    t.wakeLock.sentinels[0]!.released = true;
    t.show();
    await settle();
    expect(t.wakeLock.request).toHaveBeenCalledTimes(2);
    // A lock that is still held is not asked for again.
    t.show();
    await settle();
    expect(t.wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it("stops and says so when location is refused", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.fail(1);
    expect(t.snapshot()).toMatchObject({ phase: "idle", problem: "denied" });
    expect(t.geolocation.clearWatch).toHaveBeenCalled();
    expect(t.wakeLock.sentinels[0]!.release).toHaveBeenCalled();
  });

  it("keeps trying when the position is only unavailable for a moment", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.fail(2);
    expect(t.snapshot()).toMatchObject({ phase: "walking", fixState: "waiting", problem: null });
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().fixState).toBe("good");
  });

  it("says when the places could not be loaded, and lets everything go", async () => {
    const t = setup([], { load: () => Promise.reject(new Error("offline")) });
    await t.controller.start();
    await settle();
    expect(t.snapshot()).toMatchObject({ phase: "idle", problem: "load-failed" });
    expect(t.geolocation.clearWatch).toHaveBeenCalledWith(7);
  });

  it("says when the browser cannot read a location", async () => {
    const t = setup([story()]);
    const bare = new (await import("@/lib/walk/controller")).WalkController(
      {
        ...{ data: t.data, now: () => 0, random: () => 0.5, onVisible: () => () => undefined },
        geolocation: undefined,
        wakeLock: undefined,
        speech: undefined,
      },
      {
        locale: "en",
        accuracyAllowanceMetres: 30,
        messages: (await import("@/lib/i18n/messages/walk")).walkMessages.en,
      },
    );
    await bare.start();
    expect(bare.getSnapshot()).toMatchObject({ phase: "idle", problem: "unsupported" });
    expect(t.data.loadPlaces).not.toHaveBeenCalled();
  });

  it("calls a reading rough, and acts on nothing, until it improves", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng, 400);
    expect(t.snapshot()).toMatchObject({ fixState: "rough", current: null });
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng, 12);
    expect(t.snapshot()).toMatchObject({ fixState: "good" });
    expect(t.snapshot().current?.kind).toBe("story");
  });
});

describe("a card and the speaker", () => {
  it("reads the credit and then the words, in on-device voices, when sound is on", async () => {
    const t = setup([story()]);
    t.controller.setSound(true);
    expect(t.speech.unlock).toHaveBeenCalledTimes(1);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.speech.speak).toHaveBeenCalledTimes(1);
    const [items] = t.speech.speak.mock.calls[0]! as unknown as [
      { text: string; lang: string; voice: { localService: boolean } }[],
    ];
    expect(items.map((item) => item.text)).toEqual([
      "Kenji wrote:",
      "The champon is just as it was.",
    ]);
    expect(items.every((item) => item.voice.localService)).toBe(true);
    expect(t.snapshot().speaking).toBe(true);
    t.speech.finish();
    expect(t.snapshot().speaking).toBe(false);
  });

  it("shows the card and stays quiet when sound is off", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().current?.kind).toBe("story");
    expect(t.speech.speak).not.toHaveBeenCalled();
    expect(t.snapshot().current?.voice).toEqual({ ok: true });
  });

  it("shows the words and does not speak when there is no on-device voice for the language", async () => {
    const japanese = story("ja-shop", {
      snippet: {
        kind: "member",
        writer: "Aiko",
        lang: "ja",
        text: "ちゃんぽんは昔のままです。",
        more: false,
      },
    });
    // English on the phone; Japanese only from a server, which walk mode never uses.
    const t = setup([japanese], {
      voices: [
        LOCAL_VOICES[0]!,
        { voiceURI: "cloud", name: "Cloud", lang: "ja-JP", localService: false },
      ],
    });
    t.controller.setSound(true);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.speech.speak).not.toHaveBeenCalled();
    expect(t.snapshot().current).toMatchObject({
      narration: { body: "ちゃんぽんは昔のままです。", intro: "Aiko wrote:" },
      voice: { ok: false, missing: ["ja"] },
    });
    // Pressing Read aloud does not change that.
    t.controller.readAloud(t.snapshot().current!.id);
    expect(t.speech.speak).not.toHaveBeenCalled();
  });

  it("reads a card on a press of Read aloud, and the big button stops it", async () => {
    const t = setup([story()]);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    t.controller.readAloud(t.snapshot().current!.id);
    expect(t.speech.speak).toHaveBeenCalledTimes(1);
    expect(t.snapshot().speaking).toBe(true);
    t.controller.stopTalking();
    expect(t.speech.cancel).toHaveBeenCalled();
    expect(t.snapshot().speaking).toBe(false);
  });

  it("turning sound off stops what is being said", async () => {
    const t = setup([story()]);
    t.controller.setSound(true);
    await t.controller.start();
    await settle();
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().speaking).toBe(true);
    t.controller.setSound(false);
    expect(t.snapshot()).toMatchObject({ sound: "off", speaking: false });
  });

  it("reads at most one card in two minutes on a real walk, and never the same place twice", async () => {
    const a = walkPlace("a", ORIGIN, { story: true });
    const b = walkPlace("b", northOf(ORIGIN, 500), { story: true });
    const t = setup([a, b]);
    t.controller.setSound(true);
    await t.controller.start();
    await settle();
    t.geolocation.emit(a.pin.lat, a.pin.lng);
    expect(t.speech.speak).toHaveBeenCalledTimes(1);
    t.controller.dismiss();
    t.advance(1);
    t.geolocation.emit(b.pin.lat, b.pin.lng);
    expect(t.snapshot().current?.place.slug).toBe("b");
    expect(t.speech.speak).toHaveBeenCalledTimes(1);
    // Back at the first place: no second card for it.
    t.controller.dismiss();
    t.advance(5);
    t.geolocation.emit(a.pin.lat, a.pin.lng);
    expect(t.snapshot().current).toBeNull();
    expect(t.speech.speak).toHaveBeenCalledTimes(1);
  });

  it("puts a card that is replaced or closed under Earlier on this walk", async () => {
    const a = walkPlace("a", ORIGIN, { story: true });
    const quiet = walkPlace("quiet", northOf(ORIGIN, 500));
    const t = setup([a, quiet]);
    await t.controller.start();
    await settle();
    t.geolocation.emit(a.pin.lat, a.pin.lng);
    t.controller.dismiss();
    expect(t.snapshot().current).toBeNull();
    t.geolocation.emit(quiet.pin.lat, quiet.pin.lng);
    expect(t.snapshot().current?.kind).toBe("first-story");
    expect(t.snapshot().earlier.map((card) => card.place.slug)).toEqual(["a"]);
  });

  it("offers a detour on the phone's own draw", async () => {
    const lane = walkPlace("lane", northOf(ORIGIN, 250));
    const t = setup([lane]);
    await t.controller.start();
    await settle();
    t.advance(6);
    t.geolocation.emit(ORIGIN.lat, ORIGIN.lng);
    expect(t.snapshot().current).toMatchObject({ kind: "detour", place: { slug: "lane" } });
    expect(t.snapshot().current?.minutes).toBeGreaterThan(0);
    // The draw asked Noren nothing: the only calls are the two the walk makes.
    expect(t.data.loadPlaces).toHaveBeenCalledTimes(1);
    expect(t.data.drawToday).not.toHaveBeenCalled();
  });
});

describe("what a walk sends to Noren", () => {
  it("makes one request for the places, with no arguments, however far the person walks", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const t = setup([story(), walkPlace("quiet", northOf(ORIGIN, 500))]);
    t.controller.setSound(true);
    await t.controller.start();
    await settle();
    for (let metres = 0; metres <= 900; metres += 30) {
      t.advance(0.5);
      const at = northOf(ORIGIN, metres);
      t.geolocation.emit(at.lat, at.lng, fixAt(at).accuracy);
    }
    t.controller.stop();
    expect(t.data.loadPlaces.mock.calls).toEqual([[]]);
    expect(t.data.drawToday.mock.calls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
