import { isAllowedMapsHost } from "../geo/maps-link";

/** Every origin server code may fetch: oEmbed status checks, the geo provider and Maps link headers. */
export const SERVER_FETCH_ORIGINS = [
  "https://nominatim.openstreetmap.org",
  "https://publish.x.com",
  "https://www.youtube.com",
] as const;

/** HTTPS only, without credentials or a non-default port. */
export function isAllowedServerFetch(url: string | URL): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.port === "" &&
      (SERVER_FETCH_ORIGINS.some((origin) => origin === parsed.origin) || isAllowedMapsHost(parsed))
    );
  } catch {
    return false;
  }
}
