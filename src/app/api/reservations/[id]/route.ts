import { ok, handle } from "@/lib/http";
import {
  actOnReservation,
  alternatives,
  getClock,
  getReservation,
  toDriver,
} from "@/lib/store";
import { ensureBridge, kickHardware } from "@/lib/ecurious";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    ensureBridge();
    const { id } = await context.params;
    const reservation = getReservation(id);
    if (!reservation) return ok({ error: "Reservation not found" }, 404);
    return ok({
      reservation: toDriver(reservation),
      alternatives: alternatives(reservation.bayId),
      clock: getClock(),
    });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const reservation = actOnReservation(id, String(body.action ?? ""), {
      plate: body.plate,
      bayId: body.bayId,
      stationId: body.stationId,
      card: typeof body.card === "string" ? body.card : undefined,
    });
    const hardwareError = await kickHardware();
    return ok({
      reservation: toDriver(reservation),
      alternatives: alternatives(reservation.bayId),
      clock: getClock(),
      hardwareError,
    });
  } catch (error) {
    return handle(error);
  }
}
