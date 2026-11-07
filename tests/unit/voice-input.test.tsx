import { ConvexError } from "convex/values";
import { shellMessages } from "@/lib/i18n/messages/shell";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup as render } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VoiceInput,
  VoiceRecorder,
  VoiceStatus,
  type VoiceActions,
} from "@/components/voice/voice-input";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = initial;
    return [
      hooks.values[i],
      (value: unknown) => {
        hooks.values[i] = typeof value === "function" ? value(hooks.values[i]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = { current: initial };
    return hooks.values[i];
  },
  useEffect(callback: () => (() => void) | void) {
    const cleanup = callback();
    if (cleanup) hooks.effects.push(cleanup);
  },
}));
vi.mock("@/lib/audio/speech-wav", () => ({
  toSpeechWav: async () => new Blob(["fictional wav"], { type: "audio/wav" }),
}));
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Children.toArray(node.props.children as ReactNode).flatMap(all)];
}
let media: FakeRecorder;
const stopTrack = vi.fn();
class FakeRecorder {
  state = "inactive";
  mimeType = "audio/mp4";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    // The harness exposes the created fake so tests can deliver stop events.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    media = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["fictional audio"]) });
    this.onstop?.();
  }
}
const transcribe = vi.fn<VoiceActions["transcribe"]>();
const onText = vi.fn();
function view(locale: "en" | "ja" = "en") {
  hooks.cursor = 0;
  return VoiceRecorder({ locale, maxSeconds: 2, actions: { transcribe }, onText });
}
function changeAgreement() {
  const checkbox = all(view()).find((n) => n.type === "input")!;
  (checkbox.props.onChange as (event: unknown) => void)({ target: { checked: true } });
}
async function start() {
  changeAgreement();
  const button = all(view()).find((n) => n.type === "button")!;
  await (button.props.onClick as () => Promise<void>)();
  await Promise.resolve();
}
async function settle() {
  for (let n = 0; n < 12; n++) await Promise.resolve();
}

describe("voice story input", () => {
  beforeEach(() => {
    hooks.values = [];
    hooks.cursor = 0;
    hooks.effects = [];
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }),
      },
    });
    transcribe.mockResolvedValue("A fictional tea story.");
  });
  afterEach(() => {
    hooks.effects.forEach((cleanup) => cleanup());
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("keeps the touch-only keyboard hint while the voice flag is off", () => {
    const html = render(<VoiceInput locale="en" onText={onText} />);
    expect(html).toContain("tap the mic on your keyboard");
    expect(html).toContain("pointer:coarse");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("checkbox");
  });
  it("requires an unticked agreement and defaults the language to the page", () => {
    const tree = view("ja");
    expect(all(tree).find((n) => n.type === "input")?.props.checked).toBe(false);
    expect(all(tree).find((n) => n.type === "select")?.props.value).toBe("ja");
    expect(all(tree).find((n) => n.type === "button")?.props.disabled).toBe(true);
  });
  it("records, shows elapsed time, caps the recording, sends and inserts only text", async () => {
    await start();
    expect(render(view())).toContain("Recording: 0 / 2 seconds");
    await vi.advanceTimersByTimeAsync(1000);
    expect(render(view())).toContain("Recording: 1 / 2 seconds");
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(transcribe).toHaveBeenCalledWith(expect.any(Blob), "en");
    expect(onText).toHaveBeenCalledExactlyOnceWith("A fictional tea story.");
    expect(render(view())).toContain("Check and edit them before sharing");
    expect(stopTrack).toHaveBeenCalled();
  });
  it("shows sending and prevents duplicate starts until the action finishes", async () => {
    let resolve!: (text: string) => void;
    transcribe.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    await start();
    media.stop();
    await settle();
    expect(render(view())).toContain("Turning your recording into words");
    expect(all(view()).find((n) => n.type === "button")?.props.disabled).toBe(true);
    resolve("Fictional words");
    await settle();
    expect(onText).toHaveBeenCalledWith("Fictional words");
  });
  it("sends the chosen spoken language", async () => {
    (all(view()).find((n) => n.type === "select")!.props.onChange as (event: unknown) => void)({
      target: { value: "ja" },
    });
    await start();
    media.stop();
    await settle();
    expect(transcribe).toHaveBeenCalledWith(expect.any(Blob), "ja");
  });
  it("gives plain help for denied permission and unsupported browsers", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new DOMException("blocked", "NotAllowedError"),
    );
    await start();
    await settle();
    expect(render(view())).toContain("Allow microphone access");
    vi.stubGlobal("MediaRecorder", undefined);
    await start();
    expect(render(view())).toContain("This browser cannot record here");
    expect(transcribe).not.toHaveBeenCalled();
  });
  it("keeps errors readable, allows retry and never inserts a failed result", async () => {
    transcribe.mockRejectedValueOnce(null);
    await start();
    media.stop();
    await settle();
    expect(render(view())).toContain("Try again or type your story");
    expect(onText).not.toHaveBeenCalled();
    await start();
    media.stop();
    await settle();
    expect(onText).toHaveBeenCalledOnce();
  });
  it("uses the public error code when production hides the action message", async () => {
    transcribe.mockRejectedValueOnce(new ConvexError({ code: "rate_limited" }));
    await start();
    media.stop();
    await settle();
    expect(render(view())).toContain(shellMessages.en.rate_limited);
    expect(onText).not.toHaveBeenCalled();
  });
  it("stops microphone tracks and sends nothing when unmounted during recording", async () => {
    await start();
    hooks.effects.forEach((cleanup) => cleanup());
    await settle();
    expect(stopTrack).toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });
  it("announces failures and the recording timer with the right roles", () => {
    expect(
      render(<VoiceStatus locale="ja" state="failed" elapsed={0} maxSeconds={120} />),
    ).toContain('role="alert"');
    expect(
      render(<VoiceStatus locale="en" state="recording" elapsed={7} maxSeconds={120} />),
    ).toContain('role="timer"');
  });
});
