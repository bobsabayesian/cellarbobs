"use server";

import { cookies, headers } from "next/headers";
import QRCode from "qrcode";
import type {
  BottleParty,
  CreateParty,
  GuestBottleInput,
  PartyDetail,
  PartySummary,
  WantToBuyWine,
} from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import type { PalateSummary } from "@cellarboss/common/resources/parties";
import { api } from "./client";
import { guestCookieName, guestCookieOptions } from "./party-cookie";

export async function getParties(): Promise<ApiResult<PartySummary[]>> {
  return api.parties.getAll();
}

export async function getParty(id: number): Promise<ApiResult<PartyDetail>> {
  return api.parties.getById(id);
}

export async function createParty(
  data: CreateParty,
): Promise<ApiResult<PartyDetail>> {
  return api.parties.create(data);
}

export async function pourPartyBottle(
  id: number,
  partyBottleId: number,
): Promise<ApiResult<PartyDetail>> {
  return api.parties.pour(id, partyBottleId);
}

export async function revealPartyBottle(
  id: number,
  partyBottleId: number,
): Promise<ApiResult<PartyDetail>> {
  return api.parties.reveal(id, partyBottleId);
}

export async function finishParty(id: number): Promise<ApiResult<PartyDetail>> {
  return api.parties.finish(id);
}

export async function cancelParty(id: number): Promise<ApiResult<PartyDetail>> {
  return api.parties.cancel(id);
}

export async function addGuestBottle(
  id: number,
  bottle: GuestBottleInput,
): Promise<ApiResult<PartyDetail>> {
  return api.parties.addGuestBottle(id, bottle);
}

export async function removePartyBottle(
  id: number,
  partyBottleId: number,
): Promise<ApiResult<PartyDetail>> {
  return api.parties.removeBottle(id, partyBottleId);
}

export async function setPartyWantToBuy(
  id: number,
  partyBottleId: number,
  wantToBuy: boolean,
): Promise<ApiResult<PartyDetail>> {
  return api.parties.setWantToBuy(id, partyBottleId, wantToBuy);
}

export async function getPartiesForBottle(
  bottleId: number,
): Promise<ApiResult<BottleParty[]>> {
  return api.parties.forBottle(bottleId);
}

export async function getWantToBuy(): Promise<ApiResult<WantToBuyWine[]>> {
  return api.parties.wantToBuy();
}

export async function getPalate(): Promise<ApiResult<PalateSummary>> {
  return api.parties.palate();
}

/**
 * Lets the host rate on the guest page: fetches a fresh host secret and
 * stores it in the same cookie a guest gets when joining.
 */
export async function startHostRating(
  id: number,
): Promise<ApiResult<{ token: string }>> {
  const result = await api.parties.hostSession(id);
  if (!result.ok) return result;
  const jar = await cookies();
  jar.set(
    guestCookieName(result.data.token),
    result.data.secret,
    await guestCookieOptions(),
  );
  return { ok: true, data: { token: result.data.token } };
}

/** The public join URL for a party and a QR code (SVG) pointing at it. */
export async function getJoinCode(
  token: string,
): Promise<ApiResult<{ url: string; svg: string }>> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/party/${encodeURIComponent(token)}`;
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
  return { ok: true, data: { url, svg } };
}
