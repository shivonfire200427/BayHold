import { maskPlate, normalizePlate, readConfidence } from "./plates";
import { bayForLock } from "./stations";
import { applyCamera, hardwarePlan, isBayOccupied, markBayOccupied, setBarrier } from "./store";

/**
 * Ecurious hackathon hardware (Chang Cheng CC5S ground locks with plate cameras).
 * BayHold stays the reservation brain; Ecurious is the hands and eyes:
 *   - reserve   -> raise the barrier and whitelist the booked plate in the camera
 *   - arrival   -> the camera auto-lowers for that plate; its photo event checks the driver in
 *   - departure -> vacancy event closes the session; the barrier opens for anyone
 * API: REST /api/v1/locks/*, Server-Sent Events /events, auth via X-API-Key.
 */

export type LockStatus = {
  id: string;
  name: string;
  status: "raised" | "lowered";
  carPresence: "vacant" | "occupied";
  whitelist?: string[];
  activeErrors?: string[];
  lastSeenAt?: string;
  latestPhoto?: { timestamp: string; licensePlate: string };
};

export type HardwareEvent = {
  at: string;
  lockId: string;
  kind: "status_change" | "vehicle_presence" | "photo_captured" | "alarm" | "command" | "error";
  detail: string;
};

const ACTIVE_HOLD = ["held", "plate_review"];
const COMMAND_COOLDOWN_MS = 15_000;
const RECONCILE_MS = 8_000;

/**
 * Opt-in only. Unset, empty, or false: reserve, check-in, and release command the locks.
 * SHOWCASE_MODE=true reads live status and events and does not send whitelist, lock, or unlock.
 */
export function showcaseMode(): boolean {
  return process.env.SHOWCASE_MODE === "true";
}

export function ecuriousConfigured(): boolean {
  return Boolean(process.env.ECURIOUS_BASE_URL && apiKey());
}

function apiKey(): string | undefined {
  return process.env.ECURIOUS_API_KEY || process.env.ECURIOUS_API_TOKEN;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.ECURIOUS_BASE_URL;
  const key = apiKey();
  if (!base || !key) throw new Error("ËCURIOUS server is not configured");
  const response = await fetch(new URL(path, base), {
    ...init,
    headers: { "content-type": "application/json", "x-api-key": key, ...(init.headers ?? {}) },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ËCURIOUS ${response.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export async function listLocks(): Promise<LockStatus[]> {
  const body = await call<{ locks: LockStatus[] }>("/api/v1/locks");
  return body.locks ?? [];
}

export const raiseBarrier = (lockId: string) =>
  call(`/api/v1/locks/${encodeURIComponent(lockId)}/lock`, { method: "POST", body: JSON.stringify({ cancelAutoLift: true }) });

export const lowerBarrier = (lockId: string) =>
  call(`/api/v1/locks/${encodeURIComponent(lockId)}/unlock`, { method: "POST", body: JSON.stringify({ cancelAutoLift: true }) });

export const setWhitelist = (lockId: string, plates: string[]) =>
  call(`/api/v1/locks/${encodeURIComponent(lockId)}/whitelist`, { method: "POST", body: JSON.stringify({ plates }) });

/* ---------------- Live bridge (one per server process) ---------------- */

type Bridge = {
  started: boolean;
  connected: boolean;
  log: HardwareEvent[];
  locks: Map<string, LockStatus>;
  lastCommand: Map<string, number>;
  lastPresence: Map<string, string>;
  /** Photo timestamps already seen, so a restart does not replay an old picture. */
  primed: Set<string>;
  lastPhotoAt: Map<string, string>;
  lastAppliedPlate: Map<string, string>;
  lastAppliedAt?: Map<string, number>;
  /** Reconciles run one after another so two passes never send duplicate commands. */
  chain?: Promise<void>;
  /** True once the lock list has been fetched at least once. */
  loaded?: boolean;
  /** Bumped when this module reloads, so loops from an older copy stop. */
  generation?: number;
  timer?: ReturnType<typeof setInterval>;
};

const globalBridge = globalThis as unknown as { __wattBridge?: Bridge };
const bridge: Bridge = (globalBridge.__wattBridge ??= {
  started: false,
  connected: false,
  log: [],
  locks: new Map(),
  lastCommand: new Map(),
  lastPresence: new Map(),
  primed: new Set(),
  lastPhotoAt: new Map(),
  lastAppliedPlate: new Map(),
});
bridge.primed ??= new Set();
bridge.lastPhotoAt ??= new Map();
bridge.lastAppliedPlate ??= new Map();
bridge.lastAppliedAt ??= new Map();
const SAME_CAR_WINDOW_MS = 2 * 60 * 1000;

function record(event: Omit<HardwareEvent, "at">) {
  bridge.log.unshift({ at: new Date().toISOString(), ...event });
  bridge.log.length = Math.min(bridge.log.length, 30);
}

/** Lock ids the team currently controls, or null before the first fetch. */
export function onlineLockIds(): Set<string> | null {
  if (!ecuriousConfigured() || !bridge.loaded) return null;
  return new Set(bridge.locks.keys());
}

export function hardwareSnapshot() {
  return {
    configured: ecuriousConfigured(),
    connected: bridge.connected,
    locks: [...bridge.locks.values()].map((lock) => ({
      id: lock.id,
      name: lock.name,
      status: lock.status,
      carPresence: lock.carPresence,
      activeErrors: lock.activeErrors,
      lastSeenAt: lock.lastSeenAt,
      whitelist: (lock.whitelist ?? []).map((plate) => (plate.trim() === "*" ? "*" : "set")),
      latestPhoto: lock.latestPhoto
        ? { timestamp: lock.latestPhoto.timestamp, plateMasked: maskPlate(lock.latestPhoto.licensePlate) }
        : undefined,
    })),
    log: bridge.log,
  };
}

/** Start the event stream and reconcile loop once; safe to call on every request. */
// A new number every time this file is (re)loaded by the dev server.
const GENERATION = Date.now();

export function ensureBridge(): void {
  if (!ecuriousConfigured()) return;
  if (bridge.started && bridge.generation === GENERATION) return;
  // An older copy of this module is running (dev reload): retire its loops.
  if (bridge.timer) clearInterval(bridge.timer);
  bridge.generation = GENERATION;
  bridge.started = true;
  void listen(GENERATION);
  bridge.timer = setInterval(() => void reconcile().catch(() => undefined), RECONCILE_MS);
  void reconcile().catch(() => undefined);
}

/** Nudge the hardware right after a booking change instead of waiting for the loop. */
export async function kickHardware(): Promise<string | null> {
  if (!ecuriousConfigured()) return null;
  ensureBridge();
  try {
    await reconcile(true);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "ËCURIOUS server did not respond";
  }
}

/** Bring each real lock in line with the reservation state, one pass at a time. */
function reconcile(force = false): Promise<void> {
  const next = (bridge.chain ?? Promise.resolve()).catch(() => undefined).then(() => reconcileOnce(force));
  bridge.chain = next.catch(() => undefined);
  return next;
}

async function reconcileOnce(force: boolean): Promise<void> {
  const locks = await listLocks();
  // Rebuild from the live list: a lock reassigned away from the team must drop out.
  bridge.locks.clear();
  bridge.loaded = true;
  for (const lock of locks) {
    bridge.locks.set(lock.id, lock);
    const bay = bayForLock(lock.id);
    if (!bay) continue;

    const previous = bridge.lastPresence.get(lock.id);
    if (lock.carPresence === "occupied") markBayOccupied(bay.id);
    else if (previous === "occupied" || (previous === undefined && isBayOccupied(bay.id))) {
      onPresence(lock.id, "vacant");
    }
    bridge.lastPresence.set(lock.id, lock.carPresence);
    setBarrier(bay.id, lock.status === "raised");
    notePhoto(lock);
  }

  for (const plan of hardwarePlan()) {
    const lock = bridge.locks.get(plan.lockId);
    if (!lock) continue;
    // One failing lock must not stop the others from being updated.
    try {
      await applyPlan(plan, lock, force);
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 120) : "Command failed";
      if (bridge.log[0]?.detail !== detail) record({ lockId: plan.lockId, kind: "error", detail });
    }
  }
}

async function applyPlan(
  plan: ReturnType<typeof hardwarePlan>[number],
  lock: LockStatus,
  force: boolean,
): Promise<void> {
  {
    const holding = plan.status !== null && ACTIVE_HOLD.includes(plan.status);
    const wantRaised = holding && lock.carPresence === "vacant";
    // "*" means any plate. An open bay keeps it. A hold replaces it, and a hold
    // with no plate yet clears it so the camera is not open to every car.
    const wantPlates = holding ? (plan.plate ? [normalizePlate(plan.plate)] : []) : ["*"];
    const havePlates = listedPlates(lock.whitelist);
    const recent = Date.now() - (bridge.lastCommand.get(plan.lockId) ?? 0) < COMMAND_COOLDOWN_MS;
    if (recent && !force) return;
    // Public showcase: observe the hardware, never move it.
    if (showcaseMode()) return;

    let sent = false;
    if (havePlates.join(",") !== wantPlates.slice().sort().join(",")) {
      await setWhitelist(plan.lockId, wantPlates);
      record({
        lockId: plan.lockId,
        kind: "command",
        detail:
          wantPlates[0] && wantPlates[0] !== "*"
            ? `Camera whitelist set to ${maskPlate(wantPlates[0])}`
            : wantPlates[0] === "*"
              ? "Camera whitelist open"
              : "Camera whitelist cleared",
      });
      sent = true;
    }
    if (wantRaised && lock.status !== "raised") {
      await raiseBarrier(plan.lockId);
      record({ lockId: plan.lockId, kind: "command", detail: "Barrier raised to hold the bay" });
      sent = true;
    } else if (!wantRaised && lock.status === "raised" && !holding) {
      await lowerBarrier(plan.lockId);
      record({ lockId: plan.lockId, kind: "command", detail: "Barrier lowered, bay open" });
      sent = true;
    }
    if (sent) bridge.lastCommand.set(plan.lockId, Date.now());
  }
}

function listedPlates(plates: string[] | undefined): string[] {
  return (plates ?? [])
    .map((plate) => {
      const trimmed = plate.trim();
      return trimmed === "*" ? "*" : normalizePlate(trimmed);
    })
    .filter((plate) => plate.length > 0)
    .sort();
}

function notePhoto(lock: LockStatus) {
  const stamp = lock.latestPhoto?.timestamp ?? "";
  const plate = lock.latestPhoto?.licensePlate ?? "";
  if (!bridge.primed.has(lock.id)) {
    bridge.primed.add(lock.id);
    bridge.lastPhotoAt.set(lock.id, stamp);
    if (plate) bridge.lastAppliedPlate.set(lock.id, normalizePlate(plate));
    return;
  }
  if (!stamp || stamp === bridge.lastPhotoAt.get(lock.id) || !plate) return;
  bridge.lastPhotoAt.set(lock.id, stamp);
  // Skip only a duplicate of a read just handled (SSE and polling can both report it).
  const sameCar = normalizePlate(plate) === bridge.lastAppliedPlate.get(lock.id);
  const recent = Date.now() - (bridge.lastAppliedAt?.get(lock.id) ?? 0) < SAME_CAR_WINDOW_MS;
  if (sameCar && recent) return;
  onPhoto(lock.id, plate);
}

function onPresence(lockId: string, presence: string) {
  const bay = bayForLock(lockId);
  if (!bay) return;
  if (presence === "occupied") {
    markBayOccupied(bay.id);
    return;
  }
  if (presence !== "vacant") return;
  try {
    applyCamera(bay.id, { type: "depart" });
  } catch {
    // Unknown bay or nothing to close: ignore.
  }
}

function onPhoto(lockId: string, plate: string, reported?: number) {
  const bay = bayForLock(lockId);
  if (!bay || !plate) return;
  const kept = normalizePlate(plate);
  bridge.lastAppliedPlate.set(lockId, kept);
  bridge.lastAppliedAt?.set(lockId, Date.now());
  record({ lockId, kind: "photo_captured", detail: `Camera read ${maskPlate(plate)}` });
  try {
    applyCamera(bay.id, { type: "read", plate, confidence: readConfidence(plate, reported) });
  } catch (error) {
    record({ lockId, kind: "error", detail: error instanceof Error ? error.message : "Plate not usable" });
  }
}

/** Server-Sent Events from Ecurious, reconnecting with backoff. */
async function listen(generation: number): Promise<void> {
  let delay = 2_000;
  while (bridge.generation === generation) {
    try {
      const base = process.env.ECURIOUS_BASE_URL as string;
      const response = await fetch(new URL("/events", base), {
        headers: { "x-api-key": apiKey() as string, accept: "text/event-stream" },
        cache: "no-store",
      });
      if (!response.ok || !response.body) throw new Error(`events ${response.status}`);
      bridge.connected = true;
      delay = 2_000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (bridge.generation !== generation) {
          await reader.cancel().catch(() => undefined);
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const data = chunk
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (data) handleEvent(data);
        }
      }
    } catch {
      // fall through to reconnect
    }
    bridge.connected = false;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 30_000);
  }
}

function handleEvent(raw: string) {
  let event: {
    type?: string;
    lockId?: string;
    status?: string;
    presence?: string;
    licensePlate?: string;
    confidence?: number;
    error?: string;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }
  const lockId = event.lockId ?? "";
  const bay = bayForLock(lockId);
  switch (event.type) {
    case "status_change":
      record({ lockId, kind: "status_change", detail: `Barrier ${event.status}` });
      if (bay) setBarrier(bay.id, event.status === "raised");
      break;
    case "vehicle_presence":
      record({ lockId, kind: "vehicle_presence", detail: `Bay ${event.presence}` });
      if (event.presence) {
        bridge.lastPresence.set(lockId, event.presence);
        onPresence(lockId, event.presence);
      }
      break;
    case "photo_captured":
      onPhoto(lockId, event.licensePlate ?? "", event.confidence);
      break;
    case "alarm":
      record({ lockId, kind: "alarm", detail: `Alarm: ${event.error ?? "unknown"}` });
      break;
  }
}
