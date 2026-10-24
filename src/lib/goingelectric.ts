import type { Station } from "./types";

type GeChargepoint = { count?: number; power?: number; type?: string };
type GeLocation = {
  ge_id: number;
  name: string;
  address?: {
    street?: string;
    postcode?: string;
    city?: string;
    country?: string;
  };
  coordinates?: { lat?: number; lng?: number };
  chargepoints?: GeChargepoint[];
  network?: string;
  url?: string;
  verified?: boolean;
};

export function goingElectricConfigured(): boolean {
  return Boolean(process.env.GOINGELECTRIC_API_KEY);
}

const failureCache: { until: number; error: string } = { until: 0, error: "" };

export async function fetchGoingElectric(
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<{ stations: Station[]; error?: string }> {
  const key = process.env.GOINGELECTRIC_API_KEY;
  if (!key) return { stations: [] };
  if (Date.now() < failureCache.until) {
    return { stations: [], error: failureCache.error };
  }

  const url = new URL("https://api.goingelectric.de/chargepoints/");
  url.searchParams.set("key", key);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("radius", String(Math.max(1, Math.round(radiusKm))));

  const headers: Record<string, string> = { Accept: "application/json" };
  const referrer = process.env.GOINGELECTRIC_REFERRER;
  if (referrer) headers.Referer = referrer;

  try {
    const response = await fetch(url, { cache: "no-store", headers });
    const text = await response.text();
    const body = parseBody(text);
    if (!response.ok || (body.status && body.status !== "ok")) {
      const message =
        body.message ||
        `GoingElectric returned ${response.status}. Public charge points are temporarily unavailable.`;
      rememberFailure(response.status, message);
      return { stations: [], error: message };
    }
    failureCache.until = 0;
    return { stations: (body.chargelocations ?? []).map(mapLocation) };
  } catch {
    const message = "GoingElectric could not be reached. Public charge points are temporarily unavailable.";
    rememberFailure(0, message);
    return { stations: [], error: message };
  }
}

function parseBody(text: string): {
  status?: string;
  chargelocations?: GeLocation[];
  message?: string;
} {
  if (!text) return {};
  try {
    return JSON.parse(text) as {
      status?: string;
      chargelocations?: GeLocation[];
      message?: string;
    };
  } catch {
    return {};
  }
}

function rememberFailure(status: number, message: string) {
  const pauseMs = status === 429 ? 20 * 60 * 1000 : status === 403 ? 3 * 60 * 1000 : 30 * 1000;
  failureCache.until = Date.now() + pauseMs;
  failureCache.error = message;
}

function mapLocation(location: GeLocation): Station {
  const url = location.url?.startsWith("//") ? `https:${location.url}` : location.url;
  return {
    id: `ge-${location.ge_id}`,
    name: location.name,
    street: location.address?.street ?? "",
    postcode: location.address?.postcode ?? "",
    city: location.address?.city ?? "",
    country: location.address?.country ?? "",
    lat: location.coordinates?.lat ?? 0,
    lng: location.coordinates?.lng ?? 0,
    network: location.network || "Public",
    connectors: (location.chargepoints ?? [])
      .filter((item) => item.type && item.power)
      .map((item) => ({
        type: item.type as string,
        powerKw: item.power as number,
        count: item.count || 1,
      })),
    reservable: false,
    bays: [],
    source: "goingelectric",
    url,
    verified: location.verified,
  };
}
