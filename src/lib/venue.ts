/**
 * Where the Ecurious test bay stands, and where the map opens.
 * Override with NEXT_PUBLIC_VENUE_*
 * (set to the venue, TUM Audimax). Fallback if unset: central Munich.
 */
function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : fallback;
}

export const VENUE = {
  lat: num(process.env.NEXT_PUBLIC_VENUE_LAT, 48.1374),
  lng: num(process.env.NEXT_PUBLIC_VENUE_LNG, 11.5755),
  street: process.env.NEXT_PUBLIC_VENUE_STREET || "Hackathon venue",
  postcode: process.env.NEXT_PUBLIC_VENUE_POSTCODE || "80331",
  city: process.env.NEXT_PUBLIC_VENUE_CITY || "München",
};

/** A point roughly `northM` metres north and `eastM` metres east of the venue. */
export function nearVenue(northM: number, eastM: number): { lat: number; lng: number } {
  const lat = VENUE.lat + northM / 111_320;
  const lng = VENUE.lng + eastM / (111_320 * Math.cos((VENUE.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
