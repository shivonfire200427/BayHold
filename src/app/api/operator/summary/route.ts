import { ok, handle } from "@/lib/http";
import { summary } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(summary());
  } catch (error) {
    return handle(error);
  }
}
