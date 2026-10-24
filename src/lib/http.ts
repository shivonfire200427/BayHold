import { HttpError } from "./errors";

export function ok(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function handle(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.message, error.status);
  const message = error instanceof Error ? error.message : "Unexpected error";
  return fail(message, 500);
}
