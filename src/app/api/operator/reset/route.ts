import { ok, handle } from "@/lib/http";
import { resetDemo } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    resetDemo();
    return ok({ reset: true });
  } catch (error) {
    return handle(error);
  }
}
