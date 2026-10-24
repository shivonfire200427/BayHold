export type Connector = {
  type: string;
  powerKw: number;
  count: number;
};

export type Bay = {
  id: string;
  label: string;
  connector: string;
  powerKw: number;
  /** Ecurious lock id when this bay is real hardware (e.g. "lock-0001"). */
  lockId?: string;
};

export type Station = {
  id: string;
  name: string;
  street: string;
  postcode: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  network: string;
  connectors: Connector[];
  reservable: boolean;
  bays: Bay[];
  source: "ecurious" | "goingelectric";
  url?: string;
  verified?: boolean;
};

export type PublicBay = Bay & {
  occupancy: "empty" | "vehicle";
  hold: "open" | "engaged";
  available: boolean;
  /** Real lock that the team's API key does not currently control. */
  offline?: boolean;
};

export type PublicStation = Omit<Station, "bays"> & {
  distanceKm: number;
  maxPowerKw: number;
  bays: PublicBay[];
};

export type ReservationStatus =
  | "held"
  | "plate_review"
  | "arrived"
  | "charging"
  | "blocked"
  | "completed"
  | "cancelled"
  | "no_show"
  | "released";

export type PlateReview = {
  plate: string;
  confidence: number;
  reason: "low_confidence" | "unreadable";
};

export type Reservation = {
  id: string;
  stationId: string;
  stationName: string;
  bayId: string;
  bayLabel: string;
  plate: string | null;
  plateHash: string | null;
  holderName: string;
  source: "watt" | "ocpi";
  ocpiReservationId?: string;
  /** Masked OCPI token, e.g. "•••• 4471". The raw card id is never stored. */
  tokenUid?: string;
  /** Salted hash of the Ecurious card id: the second check-in key beside the plate. */
  cardHash?: string;
  cardMasked?: string;
  createdAt: string;
  windowStart: string;
  windowEnd: string;
  holdUntil: string;
  graceMinutes: number;
  lateExtensionUsed: boolean;
  status: ReservationStatus;
  arrivedAt?: string;
  chargeStartedAt?: string;
  endedAt?: string;
  blockedAt?: string;
  settledCents: number;
  feeReason?: string;
  plateReview?: PlateReview | null;
  blockerMasked?: string;
  blockerHash?: string;
  consentAt?: string;
  retentionUntil?: string;
  checkInPath: string;
  notes: string[];
};

export type CameraEvent =
  | { type: "read"; plate: string; confidence: number }
  | { type: "depart" };

export const ACTIVE_STATUSES: ReservationStatus[] = [
  "held",
  "plate_review",
  "arrived",
  "charging",
  "blocked",
];
