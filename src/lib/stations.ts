import type { Bay, Station } from "./types";
import { nearVenue, VENUE } from "./venue";

const SITE = {
  street: VENUE.street,
  postcode: VENUE.postcode,
  city: VENUE.city,
  country: "Deutschland",
};

/** The team's three physical Ecurious locks. Not a public charger. */
export const demoStations: Station[] = [
  {
    id: "hack-bay",
    name: "BayHold Smart Bays",
    ...SITE,
    ...nearVenue(0, 0),
    network: "BayHold",
    connectors: [],
    reservable: true,
    source: "ecurious",
    bays: [
      { id: "hack-1", label: "Bay 1", connector: "Lock", powerKw: 0, lockId: "lock-0001" },
      { id: "hack-2", label: "Bay 2", connector: "Lock", powerKw: 0, lockId: "lock-0002" },
      { id: "hack-3", label: "Bay 3", connector: "Lock", powerKw: 0, lockId: "lock-0003" },
    ],
  },
];

export function bayForLock(lockId: string): Bay | undefined {
  return demoStations.flatMap((station) => station.bays).find((bay) => bay.lockId === lockId);
}

export function findStation(id: string): Station | undefined {
  return demoStations.find((station) => station.id === id);
}

export function findBay(bayId: string): { station: Station; bay: Bay } | undefined {
  for (const station of demoStations) {
    const bay = station.bays.find((item) => item.id === bayId);
    if (bay) return { station, bay };
  }
  return undefined;
}

export function maxPower(station: { connectors: { powerKw: number }[] }): number {
  return station.connectors.reduce((max, item) => Math.max(max, item.powerKw), 0);
}
