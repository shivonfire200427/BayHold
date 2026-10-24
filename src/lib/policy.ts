export const PRICING = {
  holdCents: 150,
  noShowCents: 400,
  graceMinutes: 10,
  cancelFreeMinutes: 15,
  /** Free change of mind right after booking, even when the window has already started. */
  cancelGraceAfterBookingMinutes: 5,
  lateExtensionMinutes: 10,
  blockedReleaseMinutes: 15,
  /** Baseline the utilisation math compares against: a manual hold left up for two hours. */
  fixedManualHoldMinutes: 120,
  currency: "EUR",
};

export function euros(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).format(new Date(iso));
}

export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
