"use server";

import { cookies, headers } from "next/headers";
import type {
  MyPartyReviews,
  PartyReview,
  PublicParty,
  UpsertPartyReview,
} from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { webEnv } from "../env";
import { guestCookieName, guestCookieOptions } from "./party-cookie";

/**
 * Guest-side Party Mode calls. Unlike makeServerRequest these need no login:
 * the party token is in the path and the guest's secret comes from an
 * httpOnly cookie set when they join.
 */

function encodeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

async function publicRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  token: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const h = await headers();
  const jar = await cookies();
  const reqHeaders = new Headers({ "Content-Type": "application/json" });
  const secret = jar.get(guestCookieName(token))?.value;
  if (secret) reqHeaders.set("x-party-guest", secret);
  const clientIp =
    h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0];
  if (clientIp) reqHeaders.set("x-client-ip", clientIp.trim());

  try {
    const res = await fetch(
      `${webEnv.CELLARBOSS_SERVER}/api/public/party/${path}`,
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

export async function getPublicParty(
  token: string,
): Promise<ApiResult<PublicParty>> {
  return publicRequest<PublicParty>(encodeSegment(token), "GET", token);
}

export async function getMyPartyReviews(
  token: string,
): Promise<ApiResult<MyPartyReviews>> {
  const jar = await cookies();
  if (!jar.get(guestCookieName(token))) {
    return { ok: false, error: { message: "Not joined", status: 403 } };
  }
  return publicRequest(`${encodeSegment(token)}/me`, "GET", token);
}

export async function joinParty(
  token: string,
  name: string,
): Promise<ApiResult<{ name: string }>> {
  const result = await publicRequest<{ secret: string; name: string }>(
    `${encodeSegment(token)}/join`,
    "POST",
    token,
    { name },
  );
  if (!result.ok) return result;
  const jar = await cookies();
  jar.set(
    guestCookieName(token),
    result.data.secret,
    await guestCookieOptions(),
  );
  return { ok: true, data: { name: result.data.name } };
}

export async function savePartyReview(
  token: string,
  label: string,
  review: UpsertPartyReview,
): Promise<ApiResult<PartyReview>> {
  return publicRequest<PartyReview>(
    `${encodeSegment(token)}/review/${encodeSegment(label)}`,
    "PUT",
    token,
    review,
  );
}
