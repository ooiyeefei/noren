export const SUPPORTED_LOCALES = ["ja", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: unknown): value is Locale {
  return value === "ja" || value === "en";
}

export type MessageTable<K extends string> = Readonly<Record<K, string>>;
export type Messages<K extends string> = Readonly<Record<Locale, MessageTable<K>>>;

/** Both locales must contain every key; freeze the input and its locale tables. */
export function defineMessages<const K extends string>(messages: {
  [L in Locale]: Record<K, string>;
}): Messages<K> {
  for (const locale of SUPPORTED_LOCALES) Object.freeze(messages[locale]);
  return Object.freeze(messages);
}

export function messagesFor<K extends string>(
  messages: Messages<K>,
  locale: Locale,
): MessageTable<K> {
  return messages[locale];
}

export function format(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([^{}]+)\}/g, (placeholder: string, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}

export function localePath(locale: string, path = ""): string {
  if (path !== "" && !path.startsWith("/")) throw new Error(`Path must start with /: ${path}`);
  return `/${locale}${path}`;
}

export function localeFromPathname(pathname: string, available: readonly string[]): string | null {
  if (!pathname.startsWith("/")) return null;
  const segment = pathname.split("/")[1];
  return segment && available.includes(segment) ? segment : null;
}

export function swapLocale(pathname: string, to: string, available: readonly string[]): string {
  const current = localeFromPathname(pathname, available);
  return localePath(
    to,
    current ? pathname.slice(current.length + 1) : pathname === "/" ? "" : pathname,
  );
}

export function negotiateLocale(
  acceptLanguage: string | null,
  available: readonly string[],
  fallback: string,
): string {
  if (!acceptLanguage) return fallback;
  const preferences: { tag: string; quality: number }[] = [];
  for (const entry of acceptLanguage.split(",")) {
    const match =
      /^\s*([a-z]{1,8}(?:-[a-z0-9]{1,8})*|\*)\s*(?:;\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(
        entry,
      );
    // Malformed headers fall back rather than silently changing their meaning.
    if (!match?.[1]) return fallback;
    const quality = match[2] === undefined ? 1 : Number(match[2]);
    if (quality > 0) preferences.push({ tag: match[1].toLowerCase(), quality });
  }
  preferences.sort((a, b) => b.quality - a.quality);
  for (const { tag } of preferences) {
    if (tag === "*") return fallback;
    const exact = available.find((locale) => locale.toLowerCase() === tag);
    const primary = available.find((locale) => locale.toLowerCase() === tag.split("-")[0]);
    if (exact || primary) return exact ?? primary ?? fallback;
  }
  return fallback;
}
