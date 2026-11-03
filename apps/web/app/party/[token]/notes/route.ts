import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { webEnv } from "@/lib/env";
import { guestCookieName } from "@/lib/api/party-cookie";

/**
 * A guest's own notes as a PDF. Public like the guest page: the party token
 * is in the path and the guest's secret comes from their httpOnly cookie.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const secret = (await cookies()).get(guestCookieName(token))?.value;
  if (!secret)
    return NextResponse.json(
      { error: "Join the party first" },
      { status: 403 },
    );

  const h = await headers();
  const clientIp =
    h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  const res = await fetch(
    `${webEnv.CELLARBOSS_SERVER}/api/public/party/${encodeURIComponent(token)}/me/pdf`,
    {
      headers: {
        "x-party-guest": secret,
        ...(clientIp && { "x-client-ip": clientIp.trim() }),
      },
      cache: "no-store",
    },
  );
  if (!res.ok)
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition":
        res.headers.get("content-disposition") ??
        'attachment; filename="my notes.pdf"',
    },
  });
}
