import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// /party/<token> is the guest page for blind tastings: no login, the token is
// the credential (see lib/api/party-public.ts).
const publicRoutes = ["/login", "/api/auth", "/party/"];

/** Passes the path to the root layout, which renders some pages bare. */
function next(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return next(request);
  }

  const sessionToken = request.cookies.get("better-auth.session_token");

  if (!sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return next(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
