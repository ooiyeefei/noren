/**
 * Reduces whatever a visitor's browser sent to a same-site path: it must start with a single "/",
 * has no scheme or host, and loses its query string and fragment. Anything else becomes "".
 * The report form uses this on the client as well, so what the visitor sees is what is stored.
 */
export function samePagePath(value: string | null | undefined): string {
  const text = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text.startsWith("/") || text.startsWith("//") || text.startsWith("/\\")) return "";
  const path = text.split(/[?#]/, 1)[0] ?? "";
  return path.slice(0, 300);
}
