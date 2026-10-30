export type SegmentLike = { text: string };

/** The transcript's text: segment texts joined with "\n". Offsets are JavaScript string indices (UTF-16 units). */
export function transcriptText(segments: readonly SegmentLike[]): string {
  return segments.map((segment) => segment.text).join("\n");
}

/** Where each segment's text sits inside transcriptText(segments). */
export function segmentRanges(segments: readonly SegmentLike[]): { start: number; end: number }[] {
  let offset = 0;
  return segments.map((segment) => {
    const start = offset;
    const end = start + segment.text.length;
    offset = end + 1;
    return { start, end };
  });
}

/** Returns the slice only for a nonempty, integer span inside the text. */
export function quoteAt(text: string, spanStart: number, spanEnd: number): string | null {
  if (
    !Number.isInteger(spanStart) ||
    !Number.isInteger(spanEnd) ||
    spanStart < 0 ||
    spanStart >= spanEnd ||
    spanEnd > text.length
  ) {
    return null;
  }
  return text.slice(spanStart, spanEnd);
}

/** The nonblank quote must equal the entire valid span, without normalization. */
export function quoteMatches(
  text: string,
  spanStart: number,
  spanEnd: number,
  quote: string,
): boolean {
  const span = quoteAt(text, spanStart, spanEnd);
  return quote.trim().length > 0 && span !== null && span === quote;
}
