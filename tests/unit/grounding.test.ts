import { describe, expect, it, vi } from "vitest";
import { composeDeterministic, type ComposeClaim } from "../../src/lib/claims/compose";
import {
  checkVerbatim,
  createGroundingChecker,
  verbatimEntailment,
  type EntailmentCheck,
} from "../../src/lib/claims/grounding";
import type { GroundingClaim, GroundingSentence } from "../../src/lib/ports";

function claim(overrides: Partial<GroundingClaim> = {}): GroundingClaim {
  return {
    id: "mock-claim",
    status: "published",
    textOriginal: "架空の店の物語。",
    quote: "架空の店の物語。",
    ...overrides,
  };
}

const sentence: GroundingSentence = { text: "架空の店の物語。", claimIds: ["mock-claim"] };

describe("deterministic grounding stage", () => {
  it("unknown claim id holds", () => {
    expect(checkVerbatim([sentence], [])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["unknown_claim:mock-claim"] },
    ]);
  });

  it.each(["proposed", "owner_confirmed", "hidden"] as const)(
    "an unpublished claim holds: %s",
    (status) => {
      expect(checkVerbatim([sentence], [claim({ status })])).toEqual([
        { sentenceIndex: 0, verdict: "hold", reasons: ["claim_not_citable:mock-claim"] },
      ]);
    },
  );

  it("a sentence without ids holds", () => {
    expect(checkVerbatim([{ ...sentence, claimIds: [] }], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["no_claims"] },
    ]);
  });

  it("a blank sentence holds", () => {
    expect(checkVerbatim([{ ...sentence, text: " \n\t " }], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["blank_text"] },
    ]);
  });

  it.each(["", " \n\t "])("a cited claim without a quote holds: %j", (quote) => {
    expect(checkVerbatim([sentence], [claim({ quote })])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["missing_quote:mock-claim"] },
    ]);
  });

  it("published and disputed claims pass stage 1", () => {
    const claims = [claim(), claim({ id: "disputed", status: "disputed" })];
    expect(checkVerbatim([{ ...sentence, claimIds: ["mock-claim", "disputed"] }], claims)).toEqual([
      { sentenceIndex: 0, verdict: "pass", reasons: [] },
    ]);
  });

  it("several reasons are all reported", () => {
    expect(
      checkVerbatim(
        [
          { text: " ", claimIds: ["missing", "mock-claim"] },
          { text: "", claimIds: [] },
        ],
        [claim({ status: "hidden", quote: " " })],
      ),
    ).toEqual([
      {
        sentenceIndex: 0,
        verdict: "hold",
        reasons: [
          "blank_text",
          "unknown_claim:missing",
          "claim_not_citable:mock-claim",
          "missing_quote:mock-claim",
        ],
      },
      { sentenceIndex: 1, verdict: "hold", reasons: ["blank_text", "no_claims"] },
    ]);
  });
});

describe("grounding checker", () => {
  it("a sentence without a string text is held, not thrown", async () => {
    const entailment = vi.fn<EntailmentCheck>().mockResolvedValue({ entailed: true });
    const malformed = [undefined, null, 42, {}, []].map((text) => ({ ...sentence, text }));
    // Model output can violate the port's static type at runtime.
    // @ts-expect-error deliberately malformed text from untrusted output
    const results = await createGroundingChecker({ entailment }).check(malformed, [claim()]);
    expect(results).toEqual(
      malformed.map((_, sentenceIndex) => ({
        sentenceIndex,
        verdict: "hold",
        reasons: ["blank_text"],
      })),
    );
    expect(entailment).not.toHaveBeenCalled();
  });

  it("without an entailment check every sentence is held", async () => {
    expect(
      await createGroundingChecker({}).check(
        [sentence, { text: "uncited", claimIds: [] }],
        [claim()],
      ),
    ).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["no_entailment_check"] },
      { sentenceIndex: 1, verdict: "hold", reasons: ["no_claims"] },
    ]);
  });

  it("a throwing check holds with entailment_error and the error name", async () => {
    const entailment: EntailmentCheck = () => {
      throw new TypeError("offline");
    };
    expect(await createGroundingChecker({ entailment }).check([sentence], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["entailment_error:TypeError"] },
    ]);
  });

  it("a check that throws a string still gives a non-empty reason", async () => {
    const entailment: EntailmentCheck = () => {
      throw "";
    };
    expect(await createGroundingChecker({ entailment }).check([sentence], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["entailment_error:NonErrorThrow"] },
    ]);
  });

  it("a rejected check holds", async () => {
    const entailment: EntailmentCheck = async () => {
      throw new RangeError("unavailable");
    };
    expect(await createGroundingChecker({ entailment }).check([sentence], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["entailment_error:RangeError"] },
    ]);
  });

  it("not entailed holds with the detail", async () => {
    const entailment: EntailmentCheck = async () => ({
      entailed: false,
      detail: "Unsupported addition",
    });
    expect(await createGroundingChecker({ entailment }).check([sentence], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["not_entailed:Unsupported addition"] },
    ]);
  });

  it("not entailed without a detail still has a reason", async () => {
    const entailment: EntailmentCheck = async () => ({ entailed: false });
    expect(await createGroundingChecker({ entailment }).check([sentence], [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["not_entailed"] },
    ]);
  });

  it("stage 1 failures never reach entailment and only cited claims are passed", async () => {
    const entailment = vi.fn<EntailmentCheck>().mockResolvedValue({ entailed: true });
    const cited = claim();
    const claims = [cited, claim({ id: "unrelated" })];
    expect(
      await createGroundingChecker({ entailment }).check(
        [{ ...sentence, claimIds: ["missing"] }, sentence],
        claims,
      ),
    ).toEqual([
      { sentenceIndex: 0, verdict: "hold", reasons: ["unknown_claim:missing"] },
      { sentenceIndex: 1, verdict: "pass", reasons: [] },
    ]);
    expect(entailment).toHaveBeenCalledExactlyOnceWith(sentence, [cited]);
  });

  it("keeps input order when entailment finishes out of order and one check fails", async () => {
    let completeFirst!: (result: { entailed: boolean }) => void;
    const first = new Promise<{ entailed: boolean }>((resolve) => {
      completeFirst = resolve;
    });
    const entailment: EntailmentCheck = async (input) => {
      if (input.text === "first") return first;
      completeFirst({ entailed: true });
      throw new Error("second failed");
    };
    const sentences = [
      { ...sentence, text: "first" },
      { ...sentence, text: "second" },
    ];
    expect(await createGroundingChecker({ entailment }).check(sentences, [claim()])).toEqual([
      { sentenceIndex: 0, verdict: "pass", reasons: [] },
      { sentenceIndex: 1, verdict: "hold", reasons: ["entailment_error:Error"] },
    ]);
  });

  it("verbatimEntailment passes the claim's own text and its translation and holds anything else", async () => {
    const checker = createGroundingChecker({
      entailment: verbatimEntailment(
        new Map([
          ["mock-claim", [" 架空の店の物語。 ", " A fictional shop's story. "]],
          ["other-claim", ["Only the uncited claim says this."]],
        ]),
      ),
    });
    const sentences = [
      sentence,
      { ...sentence, text: " A fictional shop's story. " },
      { ...sentence, text: "Invented addition." },
      { ...sentence, text: "Only the uncited claim says this." },
    ];
    expect(await checker.check(sentences, [claim(), claim({ id: "other-claim" })])).toEqual([
      { sentenceIndex: 0, verdict: "pass", reasons: [] },
      { sentenceIndex: 1, verdict: "pass", reasons: [] },
      { sentenceIndex: 2, verdict: "hold", reasons: ["not_entailed"] },
      { sentenceIndex: 3, verdict: "hold", reasons: ["not_entailed"] },
    ]);
    expect(await verbatimEntailment(new Map())(sentence, [claim()])).toEqual({ entailed: false });
  });

  it("the composer's output passes the checker with verbatimEntailment", async () => {
    const claims: ComposeClaim[] = [
      {
        ...claim(),
        kind: "story",
        langOriginal: "ja",
        translations: { en: " A fictional shop's story. " },
      },
      {
        ...claim({ id: "mock-fact", status: "disputed" }),
        kind: "fact",
        langOriginal: "ja",
        translations: {},
      },
    ];
    const composed = composeDeterministic(claims, ["ja", "en"]);
    const texts = new Map(
      claims.map((item) => [item.id, [item.textOriginal, ...Object.values(item.translations)]]),
    );
    const checker = createGroundingChecker({ entailment: verbatimEntailment(texts) });
    const groundingClaims = claims.map((item) => claim(item));
    expect(composed).toHaveLength(4);
    expect(await checker.check(composed, groundingClaims)).toEqual([
      { sentenceIndex: 0, verdict: "pass", reasons: [] },
      { sentenceIndex: 1, verdict: "pass", reasons: [] },
      { sentenceIndex: 2, verdict: "pass", reasons: [] },
      { sentenceIndex: 3, verdict: "pass", reasons: [] },
    ]);
  });

  it("an empty page returns no results", async () => {
    expect(checkVerbatim([], [])).toEqual([]);
    expect(await createGroundingChecker({}).check([], [])).toEqual([]);
  });
});
