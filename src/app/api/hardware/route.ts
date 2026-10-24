import { ensureBridge, hardwareSnapshot } from "@/lib/ecurious";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Live lock status and the recent hardware event log, for the driver and operator screens. */
export async function GET() {
  ensureBridge();
  return ok(hardwareSnapshot());
}
