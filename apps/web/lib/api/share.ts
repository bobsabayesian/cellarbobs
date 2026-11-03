"use server";

import { headers } from "next/headers";
import type {
  BottleShareMark,
  CreateShareLink,
  ShareLinkDetail,
  ShareLinkSummary,
} from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { api } from "./client";

export async function getShareLinks(): Promise<ApiResult<ShareLinkSummary[]>> {
  return api.share.getAll();
}

export async function getShareLink(
  id: number,
): Promise<ApiResult<ShareLinkDetail>> {
  return api.share.getById(id);
}

export async function createShareLink(
  data: CreateShareLink,
): Promise<ApiResult<ShareLinkDetail>> {
  return api.share.create(data);
}

export async function revokeShareLink(
  id: number,
): Promise<ApiResult<ShareLinkDetail>> {
  return api.share.revoke(id);
}

export async function extendShareLink(
  id: number,
  expiresAt: string,
): Promise<ApiResult<ShareLinkDetail>> {
  return api.share.extend(id, expiresAt);
}

export async function deleteShareLink(
  id: number,
): Promise<ApiResult<{ success: boolean }>> {
  return api.share.delete(id);
}

export async function releaseShareMark(
  id: number,
  markId: number,
): Promise<ApiResult<ShareLinkDetail>> {
  return api.share.releaseMark(id, markId);
}

export async function getShareMarksForBottle(
  bottleId: number,
): Promise<ApiResult<BottleShareMark[]>> {
  return api.share.forBottle(bottleId);
}

/** The public URL for a link's token, on whatever host the request came in. */
export async function getShareUrl(token: string): Promise<ApiResult<string>> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return {
    ok: true,
    data: `${proto}://${host}/share/${encodeURIComponent(token)}`,
  };
}
