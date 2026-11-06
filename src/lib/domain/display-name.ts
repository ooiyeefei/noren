export const DISPLAY_NAME_LIMIT = 80;

/**
 * The name to store, or null when it breaks the rule: 1 to 80 characters and no `@`, so an email
 * address can't reach a page.
 */
export function cleanDisplayName(input: string): string | null {
  const name = input.trim();
  return !name || name.length > DISPLAY_NAME_LIMIT || name.includes("@") ? null : name;
}
