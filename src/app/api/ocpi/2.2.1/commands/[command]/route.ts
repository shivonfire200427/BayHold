import { ok, handle } from "@/lib/http";
import {
  actOnReservation,
  createReservation,
  getBayDirectory,
  getReservation,
  listReservations,
  toDriver,
} from "@/lib/store";
import { kickHardware, onlineLockIds } from "@/lib/ecurious";
import { findBay, findStation } from "@/lib/stations";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ command: string }> };

export async function POST(request: Request, context: Context) {
  try {
    // OCPI partners authenticate with "Authorization: Token <credentials>". Enforced when OCPI_TOKEN is set.
    const expected = process.env.OCPI_TOKEN;
    if (expected && request.headers.get("authorization") !== `Token ${expected}`) {
      return ok({ result: "REJECTED", timeout: 0, message: "Unauthorized: missing or wrong OCPI token" }, 401);
    }
    const { command } = await context.params;
    const body = await request.json();
    const name = command.toUpperCase();

    if (name === "RESERVE_NOW") {
      const stationId = String(body.location_id ?? "");
      const station = findStation(stationId);
      if (!station?.reservable) {
        return ok({ result: "REJECTED", timeout: 0, message: "Unknown reservable location" });
      }
      const requested = body.evse_uid
        ? String(body.evse_uid)
        : firstFree(station.bays.map((bay) => bay.id));
      if (!requested) {
        return ok({ result: "REJECTED", timeout: 0, message: "No free EVSE" });
      }
      const lockId = findBay(requested)?.bay.lockId;
      const online = onlineLockIds();
      if (lockId && online && !online.has(lockId)) {
        return ok({ result: "REJECTED", timeout: 0, message: "That EVSE is not available right now" });
      }
      const reservation = createReservation({
        stationId,
        bayId: requested,
        plate: body.license_plate,
        // The OCPI token uid is the driver's charging card: it becomes the second check-in key (hashed).
        holderName: "Roaming driver",
        consent: Boolean(body.license_plate),
        source: "ocpi",
        ocpiReservationId: body.reservation_id ? String(body.reservation_id) : undefined,
        tokenUid: body.token?.uid,
        windowEnd: body.expiry_date,
        startsInMin: 0,
      });
      const origin = new URL(request.url).origin;
      const hardwareError = await kickHardware();
      return ok({
        result: "ACCEPTED",
        timeout: 30,
        message: hardwareError
          ? `Hold created. The lock did not confirm yet: ${hardwareError}`
          : "BayHold extension: bind the plate at data.check_in_url. response_url is not called.",
        data: {
          reservation_id: reservation.ocpiReservationId ?? reservation.id,
          check_in_url: `${origin}${reservation.checkInPath}`,
          reservation: toDriver(reservation),
        },
      });
    }

    if (name === "CANCEL_RESERVATION") {
      const external = String(body.reservation_id ?? "");
      const match = listReservations().find(
        (item) => item.ocpiReservationId === external || item.id === external,
      );
      if (!match || !getReservation(match.id)) {
        return ok({ result: "REJECTED", timeout: 0, message: "Unknown reservation" });
      }
      actOnReservation(match.id, "cancel");
      const hardwareError = await kickHardware();
      return ok({
        result: "ACCEPTED",
        timeout: 10,
        message: hardwareError ? `Cancelled. The lock did not confirm yet: ${hardwareError}` : undefined,
      });
    }

    return ok({ result: "NOT_SUPPORTED", timeout: 0, message: "BayHold supports RESERVE_NOW and CANCEL_RESERVATION" });
  } catch (error) {
    return handle(error);
  }
}

function firstFree(bayIds: string[]): string | null {
  const directory = getBayDirectory();
  const online = onlineLockIds();
  return (
    bayIds.find((id) => {
      const lockId = findBay(id)?.bay.lockId;
      const controllable = !lockId || !online || online.has(lockId);
      return controllable && directory[id]?.available;
    }) ?? null
  );
}
