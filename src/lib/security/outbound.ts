import { isAllowedMapsHost } from "../geo/maps-link";

/** Every fixed origin server code may fetch: oEmbed, the geo provider and Maps link headers. */
export const SERVER_FETCH_ORIGINS = [
  "https://nominatim.openstreetmap.org",
  "https://publish.x.com",
  "https://www.tiktok.com",
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

/** Names that only ever mean something inside a network. */
const INTERNAL_NAME =
  /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|corp|arpa)$/;

/**
 * A page a member pasted, before its host is resolved: HTTPS on the default port, a domain name
 * rather than an address, no credentials. isPublicAddress then checks where the name points.
 */
export function isPublicPageUrl(url: string | URL): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      parsed.port === "" &&
      host.includes(".") &&
      !host.endsWith(".") &&
      !host.includes(":") &&
      !host.startsWith("[") &&
      !/^[\d.]+$/.test(host) &&
      !INTERNAL_NAME.test(host)
    );
  } catch {
    return false;
  }
}

/** Loopback, private, shared, link-local (cloud metadata), documentation, multicast and reserved. */
const NON_PUBLIC_V4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255))
    return null;
  return parts.reduce((total, part) => total * 256 + Number(part), 0);
}

function isPublicV4(address: string): boolean {
  const value = v4Number(address);
  if (value === null) return false;
  return NON_PUBLIC_V4.every(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) !== Math.floor(v4Number(base)! / size);
  });
}

/** The eight 16-bit groups of an IPv6 address, with any dotted tail written out; null if malformed. */
function v6Groups(address: string): number[] | null {
  let text = address.split("%")[0]!.toLowerCase();
  const tail = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (tail) {
    const value = v4Number(tail);
    if (value === null) return null;
    text = `${text.slice(0, -tail.length)}${Math.floor(value / 65536).toString(16)}:${(value % 65536).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.some((group) => !/^[\da-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function isPublicV6(address: string): boolean {
  const groups = v6Groups(address);
  if (!groups) return false;
  const [a, b] = groups as [number, number];
  // An IPv4 address written as IPv6 is judged as what it is.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff)
    return isPublicV4(
      `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`,
    );
  // Global unicast only, without documentation, Teredo and 6to4, which can wrap a private address.
  return (a & 0xe000) === 0x2000 && a !== 0x2002 && !(a === 0x2001 && (b === 0 || b === 0xdb8));
}

/** Whether a resolved address is on the public internet. Anything unreadable counts as private. */
export function isPublicAddress(address: string): boolean {
  return address.includes(":") ? isPublicV6(address) : isPublicV4(address);
}
