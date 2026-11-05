export type LocationRead =
  | { kind: "read"; lat: number; lng: number; accuracy: number }
  | { kind: "denied" | "unavailable" | "timeout" | "unsupported" };

/** The browser's error codes, which every browser numbers the same way. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

/**
 * One fresh reading, on a press and at no other moment (FR-105). A cached reading could pass a
 * person who has walked away, so it asks for a new one. It stays on the phone: the check-in sends
 * only which place, and the distance is worked out here.
 */
export function readLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined,
): Promise<LocationRead> {
  if (geolocation === undefined) return Promise.resolve({ kind: "unsupported" });
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          kind: "read",
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
        }),
      ({ code }) =>
        resolve({
          kind:
            code === PERMISSION_DENIED
              ? "denied"
              : code === POSITION_UNAVAILABLE
                ? "unavailable"
                : "timeout",
        }),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}
