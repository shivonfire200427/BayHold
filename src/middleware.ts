import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password for a public deployment: this app moves real barriers.
 * Set APP_PASSWORD to require it (any username). OCPI partners use their own OCPI_TOKEN instead.
 */
export function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password || request.nextUrl.pathname.startsWith("/api/ocpi/")) return NextResponse.next();
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="BayHold", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|apple-icon.png|icon-192.png|icon-512.png|manifest.webmanifest).*)"],
};
