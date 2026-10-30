import { quoteAt, segmentRanges } from "@/lib/claims/transcript-text";

export type SegmentLike = { text: string };

export function textSelectionToSpan(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { spanStart: number; spanEnd: number; quote: string } | null {
  const quote = quoteAt(text, selectionStart, selectionEnd);
  return quote?.trim() ? { spanStart: selectionStart, spanEnd: selectionEnd, quote } : null;
}

export function selectionToSpan(
  segments: readonly SegmentLike[],
  segmentIndex: number,
  startInSegment: number,
  endInSegment: number,
): { spanStart: number; spanEnd: number; quote: string } | null {
  if (!Number.isInteger(segmentIndex)) return null;
  const segment = segments[segmentIndex];
  const range = segmentRanges(segments)[segmentIndex];
  if (!segment || !range) return null;
  const selection = textSelectionToSpan(segment.text, startInSegment, endInSegment);
  return selection
    ? {
        spanStart: range.start + selection.spanStart,
        spanEnd: range.start + selection.spanEnd,
        quote: selection.quote,
      }
    : null;
}
