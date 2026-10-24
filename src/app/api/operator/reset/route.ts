import { timingSafeEqual } from "crypto";
import { fail, handle, ok } from "@/lib/http";
import { resetDemo } from "@/lib/store";

export const dynamic = "force-dynamic";

function tokenMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = process.env.OPERATOR_RESET_TOKEN;
  if (!expected) return fail("Not found", 404);

  const provided = request.headers.get("x-operator-token");
  if (!provided || !tokenMatches(provided, expected)) return fail("Forbidden", 403);

  try {
    resetDemo();
    return ok({ reset: true });
  } catch (error) {
    return handle(error);
  }
}
