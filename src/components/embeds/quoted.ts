/** A found post's words in the quotation marks of their own language: 「…」 for Japanese, “…” otherwise. */
export function quoted(text: string, lang: string | undefined): string {
  return lang === "ja" ? `「${text}」` : `“${text}”`;
}
