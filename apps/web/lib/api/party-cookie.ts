import { headers } from "next/headers";

/** Cookie holding a guest's secret for one party (httpOnly, never in JS). */
export function guestCookieName(token: string): string {
  return `cb_party_${token.replace(/[^\w-]/g, "").slice(0, 16)}`;
}

export async function guestCookieOptions() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: proto === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 3,
  };
}
