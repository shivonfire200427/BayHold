import { ensureBridge, onlineLockIds, showcaseMode } from "@/lib/ecurious";
import { fetchGoingElectric, goingElectricConfigured } from "@/lib/goingelectric";
import { ok, handle } from "@/lib/http";
import { distanceKm } from "@/lib/policy";
import { demoStations, maxPower } from "@/lib/stations";
import { VENUE } from "@/lib/venue";
import { getBayDirectory, getClock, hardwareMode } from "@/lib/store";
import type { PublicStation, Station } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    ensureBridge();
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get("lat") ?? VENUE.lat);
    const lng = Number(url.searchParams.get("lng") ?? VENUE.lng);
    const radius = Number(url.searchParams.get("radius") ?? 5);
    const minPower = Number(url.searchParams.get("minPower") ?? 0);
    const live = await fetchGoingElectric(lat, lng, radius);
    const isLive = goingElectricConfigured() && !live.error;
    // No stand-in pins: without live GoingElectric data the map shows only the real locks.
    const directorySites = isLive ? live.stations : [];
    const directory = getBayDirectory();
    const clock = getClock();
    const stations = [...demoStations, ...directorySites]
      .filter((station) => maxPower(station) >= minPower || station.reservable)
      .map((station) => decorate(station, lat, lng, directory))
      .sort((a, b) => Number(b.reservable) - Number(a.reservable) || a.distanceKm - b.distanceKm);

    const notice = !goingElectricConfigured()
      ? "Public charge points are unavailable: GOINGELECTRIC_API_KEY is not set. The map shows only the ËCURIOUS test bay."
      : live.error
        ? live.error
        : "Public charge points: data from GoingElectric.de. Reservable pins are the ËCURIOUS hardware sites.";

    return ok({
      live: isLive,
      notice,
      hardware: hardwareMode(),
      showcase: showcaseMode(),
      clock,
      origin: { lat, lng },
      stations,
    });
  } catch (error) {
    return handle(error);
  }
}

function decorate(
  station: Station,
  lat: number,
  lng: number,
  directory: ReturnType<typeof getBayDirectory>,
): PublicStation {
  return {
    ...station,
    distanceKm: Math.round(distanceKm(lat, lng, station.lat, station.lng) * 10) / 10,
    maxPowerKw: maxPower(station),
    bays: station.bays.map((bay) => {
      const runtime = directory[bay.id] ?? {
        occupancy: "empty" as const,
        hold: "open" as const,
        available: true,
      };
      const online = onlineLockIds();
      if (online && bay.lockId && !online.has(bay.lockId)) {
        return { ...bay, ...runtime, available: false, offline: true };
      }
      return { ...bay, ...runtime };
    }),
  };
}
