import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { HttpError } from "./errors";
import { PRICING } from "./policy";
import { hashCard, hashPlate, maskCard, maskPlate, normalizePlate, platesMatch, validCard, validPlate } from "./plates";
import { demoStations, findBay } from "./stations";
import {
  ACTIVE_STATUSES,
  type Bay,
  type CameraEvent,
  type Reservation,
  type ReservationStatus,
} from "./types";

type BayRuntime = {
  bayId: string;
  occupancy: "empty" | "vehicle";
  hold: "open" | "engaged";
  lastPlate: string | null;
  lastPlateMasked: string | null;
  lastConfidence: number | null;
  lastSeenAt: string | null;
};

type State = {
  clockOffsetMs: number;
  reservations: Reservation[];
  bays: Record<string, BayRuntime>;
};

const FILE = path.join(process.cwd(), "data", "state.json");
const DAY = 24 * 60 * 60 * 1000;

function emptyBays(): Record<string, BayRuntime> {
  const bays: Record<string, BayRuntime> = {};
  for (const station of demoStations) {
    for (const bay of station.bays) {
      bays[bay.id] = {
        bayId: bay.id,
        occupancy: "empty",
        hold: "open",
        lastPlate: null,
        lastPlateMasked: null,
        lastConfidence: null,
        lastSeenAt: null,
      };
    }
  }
  return bays;
}

function seed(): State {
  return {
    clockOffsetMs: 0,
    bays: emptyBays(),
    reservations: [],
  };
}

function load(): State {
  if (!existsSync(FILE)) return seed();
  const parsed = JSON.parse(readFileSync(FILE, "utf8")) as State;
  const bays = emptyBays();
  for (const [id, bay] of Object.entries(parsed.bays ?? {})) {
    if (bays[id]) bays[id] = { ...bays[id], ...bay };
  }
  return {
    clockOffsetMs: parsed.clockOffsetMs ?? 0,
    reservations: parsed.reservations ?? [],
    bays,
  };
}

function persist(state: State) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}

function nowMs(state: State): number {
  return Date.now() + state.clockOffsetMs;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function isActive(status: ReservationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

function priorNoShows(state: State, reservation: Reservation): number {
  const { plateHash, cardHash, id } = reservation;
  if (!plateHash && !cardHash) return 1;
  return state.reservations.filter(
    (item) =>
      item.id !== id &&
      item.status === "no_show" &&
      ((plateHash && item.plateHash === plateHash) || (cardHash && item.cardHash === cardHash)),
  ).length;
}

/** Free if early enough before the window, or within a few minutes of booking (change of mind). */
function freeCancel(reservation: Reservation, now: number): boolean {
  const beforeWindow = now < Date.parse(reservation.windowStart) - PRICING.cancelFreeMinutes * 60 * 1000;
  const justBooked = now < Date.parse(reservation.createdAt) + PRICING.cancelGraceAfterBookingMinutes * 60 * 1000;
  return beforeWindow || justBooked;
}

function applyTick(state: State): void {
  const now = nowMs(state);
  for (const reservation of state.reservations) {
    const open =
      reservation.status === "held" || reservation.status === "plate_review";
    if (open && now > Date.parse(reservation.holdUntil)) {
      const waived = priorNoShows(state, reservation) === 0;
      reservation.status = "no_show";
      reservation.endedAt = iso(now);
      reservation.settledCents = waived ? 0 : PRICING.noShowCents;
      reservation.feeReason = waived
        ? "First no-show waived"
        : "No-show fee, including the hold";
      reservation.retentionUntil = iso(now + DAY);
      reservation.plateReview = null;
      reservation.notes.push(
        waived
          ? "Grace ended. First no-show for this plate is waived. The hold is open."
          : "Grace ended. No-show fee applied. The hold is open.",
      );
      releaseBay(state, reservation.bayId);
    }

    if (
      reservation.status === "blocked" &&
      reservation.blockedAt &&
      now > Date.parse(reservation.blockedAt) + PRICING.blockedReleaseMinutes * 60 * 1000
    ) {
      reservation.status = "released";
      reservation.endedAt = iso(now);
      reservation.settledCents = 0;
      reservation.feeReason = "Released because the bay stayed blocked";
      reservation.retentionUntil = iso(now + DAY);
      reservation.notes.push(
        "The bay was still blocked after 15 minutes. The hold was released with no fee.",
      );
      releaseBay(state, reservation.bayId);
    }

    const bayNow = state.bays[reservation.bayId];
    if (
      reservation.status === "arrived" &&
      !reservation.chargeStartedAt &&
      bayNow?.occupancy !== "vehicle" &&
      now > Date.parse(reservation.holdUntil)
    ) {
      reservation.status = "released";
      reservation.endedAt = iso(now);
      reservation.settledCents = PRICING.holdCents;
      reservation.feeReason = "Checked in, but no vehicle arrived. The hold is kept.";
      reservation.retentionUntil = iso(now + DAY);
      reservation.notes.push(reservation.feeReason);
      releaseBay(state, reservation.bayId);
    }

    if (
      reservation.plate &&
      reservation.retentionUntil &&
      now > Date.parse(reservation.retentionUntil)
    ) {
      reservation.plate = null;
    }
  }
}

function releaseBay(state: State, bayId: string) {
  const bay = state.bays[bayId];
  if (!bay) return;
  const stillActive = state.reservations.some(
    (item) => item.bayId === bayId && isActive(item.status),
  );
  if (!stillActive) bay.hold = "open";
}

function read(): State {
  const state = load();
  applyTick(state);
  persist(state);
  return state;
}

function update(mutate: (state: State) => void): State {
  const state = load();
  applyTick(state);
  mutate(state);
  applyTick(state);
  persist(state);
  return state;
}

function nid(): string {
  return `res-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

function activeOnBay(state: State, bayId: string): Reservation | undefined {
  return state.reservations.find((item) => item.bayId === bayId && isActive(item.status));
}

function activeOnPlate(state: State, plateHash: string): Reservation | undefined {
  return state.reservations.find(
    (item) => item.plateHash === plateHash && isActive(item.status),
  );
}

/** What each real (lock-backed) bay should be doing right now. Applies expiries first. */
export function hardwarePlan(): {
  bayId: string;
  lockId: string;
  status: Reservation["status"] | null;
  plate: string | null;
}[] {
  const state = read();
  return demoStations
    .flatMap((station) => station.bays)
    .filter((bay) => bay.lockId)
    .map((bay) => {
      const current = activeOnBay(state, bay.id);
      return {
        bayId: bay.id,
        lockId: bay.lockId as string,
        status: current?.status ?? null,
        plate: current?.plate ?? null,
      };
    });
}

/** Mirror the physical barrier position reported by the hardware. */
export function setBarrier(bayId: string, raised: boolean): void {
  const want = raised ? "engaged" : "open";
  if (read().bays[bayId]?.hold === want) return;
  update((state) => {
    const bay = state.bays[bayId];
    if (bay && bay.hold !== want) bay.hold = want;
  });
}

export function getClock() {
  const state = read();
  const now = nowMs(state);
  return { offsetMs: state.clockOffsetMs, now: iso(now) };
}

export function getBayDirectory() {
  const state = read();
  const directory: Record<
    string,
    { occupancy: "empty" | "vehicle"; hold: "open" | "engaged"; available: boolean }
  > = {};
  for (const bay of Object.values(state.bays)) {
    const taken = Boolean(activeOnBay(state, bay.bayId));
    directory[bay.bayId] = {
      occupancy: bay.occupancy,
      hold: bay.hold,
      available: bay.occupancy === "empty" && !taken,
    };
  }
  return directory;
}

export function hardwareMode(): "ecurious" | "simulator" {
  return process.env.ECURIOUS_BASE_URL && (process.env.ECURIOUS_API_KEY || process.env.ECURIOUS_API_TOKEN)
    ? "ecurious"
    : "simulator";
}

export function toDriver(reservation: Reservation) {
  const { blockerHash, plateHash, cardHash, ...rest } = reservation;
  void blockerHash;
  void plateHash;
  void cardHash;
  if (rest.plateReview && !platesMatch(rest.plate, rest.plateReview.plate)) {
    return {
      ...rest,
      plateReview: { ...rest.plateReview, plate: maskPlate(rest.plateReview.plate) },
    };
  }
  return rest;
}

export function isBayOccupied(bayId: string): boolean {
  return read().bays[bayId]?.occupancy === "vehicle";
}

/** A lock reports a vehicle before a new photo arrives. Booking must refuse that bay. */
export function markBayOccupied(bayId: string): void {
  if (read().bays[bayId]?.occupancy === "vehicle") return;
  update((state) => {
    const bay = state.bays[bayId];
    if (!bay || bay.occupancy === "vehicle") return;
    bay.occupancy = "vehicle";
    bay.lastSeenAt = iso(nowMs(state));
  });
}

/** Operator view: no raw plate, no camera read, no name. Only a masked plate and an audit reference. */
export function toOperator(reservation: Reservation) {
  const { plate, plateReview, holderName, ...rest } = toDriver(reservation);
  void plateReview;
  void holderName;
  return {
    ...rest,
    plate: null,
    plateMasked: plate ? maskPlate(plate) : null,
    auditRef: reservation.plateHash ? reservation.plateHash.slice(0, 8) : null,
  };
}

export function getReservation(id: string): Reservation | undefined {
  return read().reservations.find((item) => item.id === id);
}

export function listReservations(): Reservation[] {
  return read().reservations.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export type CreateInput = {
  stationId: string;
  bayId: string;
  plate?: string | null;
  holderName?: string;
  durationMin?: number;
  startsInMin?: number;
  consent?: boolean;
  source?: "watt" | "ocpi";
  ocpiReservationId?: string;
  tokenUid?: string;
  /** Optional Ecurious card id; for OCPI bookings the token uid is used. */
  card?: string;
  windowEnd?: string;
};

export function createReservation(input: CreateInput): Reservation {
  const found = findBay(input.bayId);
  if (!found || found.station.id !== input.stationId) {
    throw new HttpError("That bay is not on this site");
  }
  if (!found.station.reservable) {
    throw new HttpError("This site has no reservation hardware");
  }
  if (input.source !== "ocpi" && !input.consent) {
    throw new HttpError("Plate consent is required");
  }

  let plate: string | null = null;
  let plateHash: string | null = null;
  if (input.plate) {
    if (!validPlate(input.plate)) {
      throw new HttpError("Enter a plate with 4 to 12 letters or digits");
    }
    plate = normalizePlate(input.plate);
    plateHash = hashPlate(plate);
  } else if (input.source !== "ocpi") {
    throw new HttpError("A license plate is required");
  }

  const cardSource = input.card?.trim() || input.tokenUid?.trim() || "";
  if (input.card?.trim() && !validCard(input.card)) {
    throw new HttpError("Enter a card id with 4 to 32 letters or digits");
  }
  const cardHash = cardSource && validCard(cardSource) ? hashCard(cardSource) : undefined;
  const cardMasked = cardSource && validCard(cardSource) ? maskCard(cardSource) : undefined;

  const duration = input.durationMin ?? 45;
  if (![30, 45, 60].includes(duration) && !input.windowEnd) {
    throw new HttpError("Choose a 30, 45, or 60 minute window");
  }
  const startsIn = Math.max(0, Math.min(30, input.startsInMin ?? 0));

  let created: Reservation | undefined;
  update((state) => {
    if (activeOnBay(state, input.bayId)) {
      throw new HttpError("This bay is already reserved", 409);
    }
    if (plateHash && activeOnPlate(state, plateHash)) {
      throw new HttpError("This plate already has an open reservation", 409);
    }
    const bay = state.bays[input.bayId];
    if (bay.occupancy === "vehicle") {
      throw new HttpError("A vehicle is already in this bay", 409);
    }
    const now = nowMs(state);
    const windowStart = now + startsIn * 60 * 1000;
    const windowEnd = input.windowEnd
      ? Date.parse(input.windowEnd)
      : windowStart + duration * 60 * 1000;
    if (!Number.isFinite(windowEnd) || windowEnd <= now) {
      throw new HttpError("The reservation window has already ended");
    }
    const id = nid();
    created = {
      id,
      stationId: found.station.id,
      stationName: found.station.name,
      bayId: found.bay.id,
      bayLabel: found.bay.label,
      plate,
      plateHash,
      holderName: input.holderName?.trim() || "Driver",
      source: input.source ?? "watt",
      ocpiReservationId: input.ocpiReservationId,
      tokenUid: input.tokenUid ? maskCard(input.tokenUid) : undefined,
      cardHash,
      cardMasked,
      createdAt: iso(now),
      windowStart: iso(windowStart),
      windowEnd: iso(windowEnd),
      holdUntil: iso(windowEnd + PRICING.graceMinutes * 60 * 1000),
      graceMinutes: PRICING.graceMinutes,
      lateExtensionUsed: false,
      status: "held",
      settledCents: 0,
      consentAt: input.consent ? iso(now) : undefined,
      checkInPath: `/r/${id}`,
      notes: [
        plate
          ? "Bay hold is on. It stays free until the booked plate arrives."
          : "Bay hold is on. Bind a plate on the check-in link before arrival.",
      ],
    };
    state.reservations.push(created);
    bay.hold = "engaged";
  });
  if (!created) throw new HttpError("Could not create the reservation");
  return created;
}

export function alternatives(excludeBayId: string): { stationId: string; stationName: string; bay: Bay }[] {
  const state = read();
  const options: { stationId: string; stationName: string; bay: Bay }[] = [];
  for (const station of demoStations) {
    if (!station.reservable) continue;
    for (const bay of station.bays) {
      if (bay.id === excludeBayId) continue;
      const runtime = state.bays[bay.id];
      if (!runtime || runtime.occupancy !== "empty" || activeOnBay(state, bay.id)) continue;
      options.push({ stationId: station.id, stationName: station.name, bay });
    }
  }
  return options;
}

export function actOnReservation(
  id: string,
  action: string,
  extra: { plate?: string; bayId?: string; stationId?: string; card?: string } = {},
): Reservation {
  let result: Reservation | undefined;
  update((state) => {
    const reservation = state.reservations.find((item) => item.id === id);
    if (!reservation) throw new HttpError("Reservation not found", 404);
    const now = nowMs(state);
    const bay = state.bays[reservation.bayId];

    if (action === "cancel") {
      if (!isActive(reservation.status) || reservation.status === "charging") {
        throw new HttpError("This reservation can no longer be cancelled");
      }
      const blocked = reservation.status === "blocked";
      const free = blocked || freeCancel(reservation, now);
      reservation.status = "cancelled";
      reservation.endedAt = iso(now);
      reservation.settledCents = free ? 0 : PRICING.holdCents;
      reservation.feeReason = blocked
        ? "Cancelled because the bay was blocked"
        : free
          ? "Cancelled early, hold refunded"
          : "Hold kept. Cancelled inside 15 minutes of the window.";
      reservation.retentionUntil = iso(now + DAY);
      reservation.notes.push(reservation.feeReason);
      releaseBay(state, reservation.bayId);
    } else if (action === "late") {
      if (reservation.status !== "held" && reservation.status !== "plate_review") {
        throw new HttpError("A late extension is only available while the bay is held");
      }
      if (reservation.lateExtensionUsed) {
        throw new HttpError("The late extension was already used");
      }
      const extraMs = PRICING.lateExtensionMinutes * 60 * 1000;
      reservation.windowEnd = iso(Date.parse(reservation.windowEnd) + extraMs);
      reservation.holdUntil = iso(Date.parse(reservation.holdUntil) + extraMs);
      reservation.lateExtensionUsed = true;
      reservation.notes.push("Hold extended by 10 minutes, once.");
    } else if (action === "confirm_plate") {
      if (reservation.status !== "plate_review" || !reservation.plateReview) {
        throw new HttpError("There is no plate waiting for confirmation");
      }
      if (platesMatch(reservation.plate, reservation.plateReview.plate)) {
        markArrived(reservation, bay, now, "Driver confirmed the camera read.");
      } else {
        markBlocked(reservation, bay, reservation.plateReview.plate, now);
      }
    } else if (action === "reject_plate") {
      if (reservation.status !== "plate_review" || !reservation.plateReview) {
        throw new HttpError("There is no plate waiting for confirmation");
      }
      markBlocked(reservation, bay, reservation.plateReview.plate, now);
    } else if (action === "charge") {
      if (reservation.status !== "arrived" && reservation.status !== "charging") {
        throw new HttpError("Charging starts after the booked plate is checked in");
      }
      if (reservation.status !== "charging") {
        reservation.status = "charging";
        reservation.chargeStartedAt = iso(now);
        reservation.settledCents = 0;
        reservation.feeReason = "Hold credited because charging started";
        reservation.notes.push("Charging started. The €1.50 hold is credited.");
      }
    } else if (action === "release") {
      if (!isActive(reservation.status)) {
        throw new HttpError("This reservation is already closed");
      }
      const charged = reservation.status === "charging" || Boolean(reservation.chargeStartedAt);
      const wasBlocked = reservation.status === "blocked";
      reservation.status = charged ? "completed" : "released";
      reservation.endedAt = iso(now);
      if (charged) {
        reservation.settledCents = 0;
        reservation.feeReason = "Hold credited because charging started";
        reservation.notes.push("Session ended. The hold is open. The bay frees when the vehicle leaves.");
      } else if (wasBlocked) {
        reservation.settledCents = 0;
        reservation.feeReason = "Released because the bay was blocked";
        reservation.notes.push("Hold released. No fee, because the bay was blocked.");
      } else if (reservation.arrivedAt) {
        reservation.settledCents = PRICING.holdCents;
        reservation.feeReason = "Left without charging. The hold is kept.";
        reservation.notes.push("Vehicle left before charging. The hold is kept.");
      } else {
        reservation.status = "cancelled";
        const free = freeCancel(reservation, now);
        reservation.settledCents = free ? 0 : PRICING.holdCents;
        reservation.feeReason = free ? "Cancelled early, hold refunded" : "Hold kept";
        reservation.notes.push(reservation.feeReason);
      }
      reservation.retentionUntil = iso(now + DAY);
      releaseBay(state, reservation.bayId);
    } else if (action === "bind_card") {
      if (!extra.card || !validCard(extra.card)) {
        throw new HttpError("Enter a card id with 4 to 32 letters or digits");
      }
      if (!isActive(reservation.status) || reservation.status === "charging" || reservation.status === "arrived") {
        throw new HttpError("The card can no longer be changed");
      }
      reservation.cardHash = hashCard(extra.card);
      reservation.cardMasked = maskCard(extra.card);
      reservation.notes.push(`Ecurious card ${reservation.cardMasked} added as a second check-in key.`);
    } else if (action === "card_check_in") {
      // Second key: when the camera cannot read the plate, the booked card checks the driver in.
      if (!reservation.cardHash) throw new HttpError("No Ecurious card is linked to this booking");
      if (!extra.card || !validCard(extra.card)) throw new HttpError("Tap or enter your Ecurious card");
      if (reservation.status === "blocked") {
        throw new HttpError("Another vehicle is in the bay. Pick another bay first.", 409);
      }
      if (reservation.status !== "held" && reservation.status !== "plate_review") {
        throw new HttpError("This booking cannot be checked in now");
      }
      if (hashCard(extra.card) !== reservation.cardHash) {
        throw new HttpError("This card is not linked to the booking", 403);
      }
      markArrived(reservation, bay, now, `Checked in with Ecurious card ${reservation.cardMasked}. Barrier lowering.`);
    } else if (action === "bind_plate") {
      if (!extra.plate || !validPlate(extra.plate)) {
        throw new HttpError("Enter a plate with 4 to 12 letters or digits");
      }
      if (!isActive(reservation.status) || reservation.status === "charging" || reservation.status === "arrived") {
        throw new HttpError("The plate can no longer be changed");
      }
      const next = normalizePlate(extra.plate);
      const nextHash = hashPlate(next);
      const other = activeOnPlate(state, nextHash);
      if (other && other.id !== reservation.id) {
        throw new HttpError("This plate already has an open reservation", 409);
      }
      reservation.plate = next;
      reservation.plateHash = nextHash;
      reservation.consentAt = reservation.consentAt ?? iso(now);
      reservation.notes.push("Plate bound to this reservation.");
      if (bay.occupancy === "vehicle" && bay.lastPlate) {
        judgeArrival(reservation, bay, bay.lastPlate, bay.lastConfidence ?? 0.9, now);
      }
    } else if (action === "reroute") {
      if (reservation.status !== "blocked") {
        throw new HttpError("Another bay is offered when this one is blocked");
      }
      const targetId = extra.bayId;
      const target = targetId ? findBay(targetId) : undefined;
      if (!target) throw new HttpError("Choose another free bay");
      if (activeOnBay(state, target.bay.id) || state.bays[target.bay.id]?.occupancy === "vehicle") {
        throw new HttpError("That bay is no longer free", 409);
      }
      reservation.status = "released";
      reservation.endedAt = iso(now);
      reservation.settledCents = 0;
      reservation.feeReason = "Moved to another bay";
      reservation.retentionUntil = iso(now + DAY);
      reservation.notes.push(`Moved from ${reservation.bayLabel} to ${target.bay.label}.`);
      releaseBay(state, reservation.bayId);

      const replacement = createInside(state, {
        stationId: target.station.id,
        bayId: target.bay.id,
        plate: reservation.plate,
        holderName: reservation.holderName,
        consent: true,
        source: reservation.source,
        cardHash: reservation.cardHash,
        cardMasked: reservation.cardMasked,
        durationMin: Math.max(
          30,
          Math.round((Date.parse(reservation.windowEnd) - Date.parse(reservation.windowStart)) / 60000),
        ),
      });
      result = replacement;
      return;
    } else {
      throw new HttpError("Unknown action");
    }
    result = reservation;
  });
  if (!result) throw new HttpError("Reservation not found", 404);
  return result;
}

function createInside(
  state: State,
  input: CreateInput & { cardHash?: string; cardMasked?: string },
): Reservation {
  const found = findBay(input.bayId);
  if (!found) throw new HttpError("That bay is not on this site");
  const now = nowMs(state);
  const plate = input.plate ? normalizePlate(input.plate) : null;
  const id = nid();
  const windowEnd = now + (input.durationMin ?? 45) * 60 * 1000;
  const reservation: Reservation = {
    id,
    stationId: found.station.id,
    stationName: found.station.name,
    bayId: found.bay.id,
    bayLabel: found.bay.label,
    plate,
    plateHash: plate ? hashPlate(plate) : null,
    holderName: input.holderName || "Driver",
    source: input.source ?? "watt",
    cardHash: input.cardHash,
    cardMasked: input.cardMasked,
    createdAt: iso(now),
    windowStart: iso(now),
    windowEnd: iso(windowEnd),
    holdUntil: iso(windowEnd + PRICING.graceMinutes * 60 * 1000),
    graceMinutes: PRICING.graceMinutes,
    lateExtensionUsed: false,
    status: "held",
    settledCents: 0,
    consentAt: iso(now),
    checkInPath: `/r/${id}`,
    notes: ["Moved here because the previous bay was blocked."],
  };
  state.reservations.push(reservation);
  const bay = state.bays[found.bay.id];
  if (bay) bay.hold = "engaged";
  return reservation;
}

export function applyCamera(bayId: string, event: CameraEvent): {
  bay: BayRuntime;
  reservation: Reservation | null;
} {
  let reservation: Reservation | null = null;
  let bayOut: BayRuntime | undefined;
  update((state) => {
    const bay = state.bays[bayId];
    if (!bay) throw new HttpError("Unknown bay", 404);
    const now = nowMs(state);
    const current = activeOnBay(state, bayId) ?? null;

    if (event.type === "depart") {
      bay.occupancy = "empty";
      bay.lastPlate = null;
      bay.lastPlateMasked = null;
      bay.lastConfidence = null;
      bay.lastSeenAt = iso(now);
      if (current && (current.status === "arrived" || current.status === "charging")) {
        const charged = current.status === "charging" || Boolean(current.chargeStartedAt);
        current.status = charged ? "completed" : "released";
        current.endedAt = iso(now);
        current.retentionUntil = iso(now + DAY);
        if (charged) {
          current.settledCents = 0;
          current.feeReason = "Hold credited because charging started";
          current.notes.push("Vehicle left. Session closed and the bay is free.");
        } else {
          current.settledCents = PRICING.holdCents;
          current.feeReason = "Left without charging. The hold is kept.";
          current.notes.push("Vehicle left before charging. The hold is kept.");
        }
        releaseBay(state, bayId);
      } else if (current && current.status === "blocked") {
        current.status = "held";
        current.blockedAt = undefined;
        current.blockerMasked = undefined;
        current.blockerHash = undefined;
        current.plateReview = null;
        current.notes.push("The other vehicle left. The bay is held for you again.");
        bay.hold = "engaged";
      }
      reservation = current;
      bayOut = bay;
      return;
    }

    const seen = normalizePlate(event.plate);
    if (!validPlate(seen)) throw new HttpError("Camera read is not a usable plate");
    bay.occupancy = "vehicle";
    bay.lastPlate = seen;
    bay.lastPlateMasked = maskPlate(seen);
    bay.lastConfidence = event.confidence;
    bay.lastSeenAt = iso(now);

    if (!current) {
      reservation = null;
      bayOut = bay;
      return;
    }
    judgeArrival(current, bay, seen, event.confidence, now);
    reservation = current;
    bayOut = bay;
  });
  if (!bayOut) throw new HttpError("Unknown bay", 404);
  return { bay: bayOut, reservation };
}

function judgeArrival(
  reservation: Reservation,
  bay: BayRuntime,
  seen: string,
  confidence: number,
  now: number,
) {
  if (!reservation.plate) {
    reservation.status = "plate_review";
    reservation.plateReview = { plate: seen, confidence, reason: "low_confidence" };
    reservation.notes.push("A vehicle arrived, but this hold has no plate yet.");
    return;
  }
  if (confidence < 0.6) {
    reservation.status = "plate_review";
    reservation.plateReview = { plate: seen, confidence, reason: "unreadable" };
    reservation.notes.push("Camera could not read the plate. Confirm it, or wait for another read.");
    return;
  }
  const matches = platesMatch(reservation.plate, seen);
  if (matches && confidence >= 0.85) {
    markArrived(reservation, bay, now, "Plate matched. The bay is checked in.");
    return;
  }
  if (matches) {
    reservation.status = "plate_review";
    reservation.plateReview = { plate: seen, confidence, reason: "low_confidence" };
    reservation.notes.push("Plate looks like a match, but the camera is not confident.");
    return;
  }
  markBlocked(reservation, bay, seen, now);
}

function markArrived(reservation: Reservation, bay: BayRuntime, now: number, note: string) {
  reservation.status = "arrived";
  reservation.arrivedAt = iso(now);
  reservation.plateReview = null;
  reservation.blockerMasked = undefined;
  reservation.blockerHash = undefined;
  reservation.notes.push(note);
  bay.hold = "engaged";
}

function markBlocked(reservation: Reservation, bay: BayRuntime, seen: string, now: number) {
  reservation.status = "blocked";
  reservation.blockedAt = iso(now);
  reservation.plateReview = null;
  reservation.blockerMasked = maskPlate(seen);
  reservation.blockerHash = hashPlate(normalizePlate(seen));
  reservation.notes.push(
    "A different vehicle is in the bay. The hold does not trap it, and you are not charged.",
  );
  bay.hold = "open";
}

export function resetDemo(): void {
  persist(seed());
}

export function summary() {
  const state = read();
  const reservations = state.reservations;
  const closed = reservations.filter((item) => !isActive(item.status));
  const arrivals = reservations.filter((item) => item.arrivedAt);
  const noShows = reservations.filter((item) => item.status === "no_show");
  const blocked = reservations.filter((item) => item.blockerMasked || item.status === "blocked");
  const recovered = reservations.reduce((sum, item) => sum + recoveredMinutes(item), 0);
  const fees = reservations.reduce((sum, item) => sum + (item.settledCents || 0), 0);
  return {
    now: iso(nowMs(state)),
    offsetMs: state.clockOffsetMs,
    hardware: hardwareMode(),
    counts: {
      reservations: reservations.length,
      active: reservations.filter((item) => isActive(item.status)).length,
      arrivals: arrivals.length,
      noShows: noShows.length,
      blocked: blocked.length,
      arrivalRate: reservations.length
        ? Math.round((arrivals.length / reservations.length) * 100)
        : 0,
      noShowRate: reservations.length
        ? Math.round((noShows.length / reservations.length) * 100)
        : 0,
    },
    recoveredMinutes: recovered,
    baselineMinutes: PRICING.fixedManualHoldMinutes,
    feesCents: fees,
    creditedHolds: reservations.filter((item) => item.feeReason?.includes("credited")).length,
    closed: closed.length,
    bays: Object.values(state.bays).map((bay) => ({
      ...bay,
      lastPlate: undefined,
      reservationId: activeOnBay(state, bay.bayId)?.id ?? null,
    })),
    reservations: reservations
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(toOperator),
  };
}

function recoveredMinutes(reservation: Reservation): number {
  if (!reservation.endedAt) return 0;
  if (!["no_show", "cancelled", "released"].includes(reservation.status)) return 0;
  const actual = (Date.parse(reservation.endedAt) - Date.parse(reservation.createdAt)) / 60000;
  return Math.max(0, Math.round(PRICING.fixedManualHoldMinutes - actual));
}
