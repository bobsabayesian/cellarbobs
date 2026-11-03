import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { webEnv } from "@/lib/env";

/** Streams the attendee PDF from the backend, for the logged-in host. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id))
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const cookie = (await headers()).get("cookie");
  if (!cookie)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scores = req.nextUrl.searchParams.get("scores") === "0" ? "0" : "1";
  const res = await fetch(
    `${webEnv.CELLARBOSS_SERVER}/api/party/${id}/pdf?scores=${scores}`,
    { headers: { cookie }, cache: "no-store" },
  );
  if (!res.ok)
    return new NextResponse(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  return new NextResponse(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition":
        res.headers.get("content-disposition") ??
        'attachment; filename="tasting.pdf"',
    },
  });
}
