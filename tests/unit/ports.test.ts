import { assertType, describe, expect, expectTypeOf, it } from "vitest";
import {
  GROUNDING_VERDICTS,
  TRANSLATOR_INPUT_KINDS,
  type GroundingChecker,
  type GroundingResult,
  type SourceAdapter,
  type Transcriber,
  type Translator,
  type TranslatorInputKind,
} from "../../src/lib/ports";

describe("shared port contracts", () => {
  it("forbids storage and AI processing of source content", () => {
    expectTypeOf<SourceAdapter["policy"]["storesContent"]>().toEqualTypeOf<false>();
    expectTypeOf<SourceAdapter["policy"]["aiAllowed"]>().toEqualTypeOf<false>();
    // @ts-expect-error Source content must never be stored.
    assertType<SourceAdapter["policy"]["storesContent"]>(true);
    // @ts-expect-error Platform content must never reach AI.
    assertType<SourceAdapter["policy"]["aiAllowed"]>(true);
  });

  it("limits translation to the three consent-eligible input kinds", () => {
    expect(TRANSLATOR_INPUT_KINDS).toEqual(["claim", "note", "live_chunk"]);
    expectTypeOf<TranslatorInputKind>().toEqualTypeOf<"claim" | "note" | "live_chunk">();
    expectTypeOf<
      Parameters<Translator["translate"]>[1]["inputKind"]
    >().toEqualTypeOf<TranslatorInputKind>();
    // @ts-expect-error Platform content is never an eligible input kind.
    assertType<Parameters<Translator["translate"]>[1]["inputKind"]>("platform_content");
    type Result = Awaited<ReturnType<Translator["translate"]>>;
    expectTypeOf<Extract<Result, { ok: false }>>().toEqualTypeOf<{
      ok: false;
      reason: string;
    }>();
    expectTypeOf<Extract<Result, { ok: true }>["items"][number]>().toEqualTypeOf<
      {
        itemId: string;
        text: string;
      } & { modelVersion: string }
    >();
  });

  it("returns a language for every transcription", () => {
    expectTypeOf<
      Awaited<ReturnType<Transcriber["transcribe"]>>["language"]
    >().toEqualTypeOf<string>();
  });

  it("restricts grounding to pass or hold, as named in ports.md", () => {
    expect(GROUNDING_VERDICTS).toEqual(["pass", "hold"]);
    expectTypeOf<Awaited<ReturnType<GroundingChecker["check"]>>>().toEqualTypeOf<
      GroundingResult[]
    >();
    expectTypeOf<GroundingResult["verdict"]>().toEqualTypeOf<"pass" | "hold">();
    // @ts-expect-error A checker cannot return an unchecked verdict.
    assertType<GroundingResult["verdict"]>("unknown");
  });
});
