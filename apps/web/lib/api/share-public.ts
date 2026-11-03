"use server";

import { cookies, headers } from "next/headers";
import type { SharedCellar } from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { webEnv } from "../env";

/**
 * Calls for people with a shared link. No login: the link token is in the
 * path, and the viewer's secret is an httpOnly cookie set when they give
 * their name.
 */

function cookieName(token: string): string {
  return `cb_share_${token.replace(/[^\w-]/g, "").slice(0, 16)}`;
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

async function publicRequest<T>(
  path: string,
  method: "GET" | "POST" | "DELETE",
  token: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const h = await headers();
  const jar = await cookies();
  const reqHeaders = new Headers({ "Content-Type": "application/json" });
  const secret = jar.get(cookieName(token))?.value;
  if (secret) reqHeaders.set("x-share-guest", secret);
  const clientIp =
    h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  if (clientIp) reqHeaders.set("x-client-ip", clientIp.trim());

  try {
    const res = await fetch(
      `${webEnv.CELLARBOSS_SERVER}/api/public/share/${encodeSegment(token)}${path}`,
      {
        method,
        headers: reqHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: {
          message: (data as { error?: string }).error ?? res.statusText,
          status: res.status,
        },
      };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      error: {
        message: err instanceof Error ? err.message : "Network error",
        status: 503,
      },
    };
  }
}

export async function getSharedCellar(
  token: string,
): Promise<ApiResult<SharedCellar>> {
  return publicRequest<SharedCellar>("", "GET", token);
}

export async function joinShare(
  token: string,
  name: string,
): Promise<ApiResult<{ name: string }>> {
  const result = await publicRequest<{ secret: string; name: string }>(
    "/join",
    "POST",
    token,
    { name },
  );
  if (!result.ok) return result;
  const h = await headers();
  const jar = await cookies();
  jar.set(cookieName(token), result.data.secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: h.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return { ok: true, data: { name: result.data.name } };
}

export async function markShared(
  token: string,
  vintageId: number,
): Promise<ApiResult<SharedCellar>> {
  return publicRequest<SharedCellar>("/mark", "POST", token, { vintageId });
}

export async function unmarkShared(
  token: string,
  markId: number,
): Promise<ApiResult<SharedCellar>> {
  return publicRequest<SharedCellar>(`/mark/${markId}`, "DELETE", token);
}
