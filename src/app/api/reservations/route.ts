import { ok, handle } from "@/lib/http";
import { createReservation, getClock, toDriver } from "@/lib/store";
import { kickHardware, onlineLockIds } from "@/lib/ecurious";
import { HttpError } from "@/lib/errors";
import { findBay } from "@/lib/stations";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const target = findBay(String(body.bayId ?? ""));
    const online = onlineLockIds();
    if (target?.bay.lockId && online && !online.has(target.bay.lockId)) {
      throw new HttpError("This lock is not assigned to your team right now. Pick another lock.", 409);
    }
    const reservation = createReservation({
      stationId: String(body.stationId ?? ""),
      bayId: String(body.bayId ?? ""),
      plate: body.plate,
      holderName: body.holderName,
      durationMin: Number(body.durationMin ?? 45),
      startsInMin: Number(body.startsInMin ?? 0),
      consent: Boolean(body.consent),
      card: typeof body.card === "string" ? body.card : undefined,
    });
    const hardwareError = await kickHardware();
    return ok({ reservation: toDriver(reservation), clock: getClock(), hardwareError }, 201);
  } catch (error) {
    return handle(error);
  }
}
