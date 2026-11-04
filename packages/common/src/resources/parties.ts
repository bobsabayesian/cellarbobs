import type {
  BottleParty,
  CreateParty,
  GuestBottleInput,
  BottleDetailsInput,
  WantToBuyWine,
  PalateProfile,
  PartyDetail,
  PartyJoinResult,
  PartySummary,
  TasterCalibration,
  GuessAccuracy,
} from "@cellarboss/types";
import type { ApiResult, RequestFn } from "../types";

export interface PalateSummary {
  profile: PalateProfile;
  calibration: TasterCalibration[];
  hostGuessAccuracy: GuessAccuracy[];
}

/** Request body for a guest bottle: an existing wine, or a new one. */
function guestBottleBody(bottle: GuestBottleInput) {
  if ("mystery" in bottle)
    return { mystery: true, broughtBy: bottle.broughtBy };
  if ("newWine" in bottle)
    return { newWine: bottle.newWine, broughtBy: bottle.broughtBy };
  return {
    wineId: Number(bottle.wineId),
    year: bottle.year === null ? null : Number(bottle.year),
    broughtBy: bottle.broughtBy,
  };
}

/** Host-side Party Mode endpoints (require a session). */
export function partiesResource(request: RequestFn) {
  return {
    getAll: (): Promise<ApiResult<PartySummary[]>> =>
      request<PartySummary[]>("party", "GET"),

    getById: (id: number): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>("party/" + id, "GET"),

    create: (data: CreateParty): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(
        "party",
        "POST",
        JSON.stringify({
          title: data.title,
          date: data.date,
          scoreScale: Number(data.scoreScale),
          format: data.format,
          pacing: data.pacing ?? "all",
          bottleIds: data.bottleIds.map(Number),
          guestBottles: (data.guestBottles ?? []).map(guestBottleBody),
        }),
      ),

    pour: (
      id: number,
      partyBottleId: number,
    ): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(`party/${id}/pour/${partyBottleId}`, "POST"),

    reveal: (
      id: number,
      partyBottleId: number,
    ): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(`party/${id}/reveal/${partyBottleId}`, "POST"),

    finish: (id: number): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(`party/${id}/finish`, "POST"),

    cancel: (id: number): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(`party/${id}/cancel`, "POST"),

    hostSession: (
      id: number,
    ): Promise<ApiResult<PartyJoinResult & { token: string }>> =>
      request<PartyJoinResult & { token: string }>(
        `party/${id}/host-session`,
        "POST",
      ),

    addGuestBottle: (
      id: number,
      bottle: GuestBottleInput,
    ): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(
        `party/${id}/guest-bottle`,
        "POST",
        JSON.stringify(guestBottleBody(bottle)),
      ),

    /** Says what a mystery bottle turned out to be. */
    fillDetails: (
      id: number,
      partyBottleId: number,
      details: BottleDetailsInput,
    ): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(
        `party/${id}/bottle/${partyBottleId}/details`,
        "POST",
        JSON.stringify(
          "newWine" in details
            ? { newWine: details.newWine }
            : { wineId: Number(details.wineId), year: details.year },
        ),
      ),

    removeBottle: (
      id: number,
      partyBottleId: number,
    ): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(`party/${id}/bottle/${partyBottleId}`, "DELETE"),

    setWantToBuy: (
      id: number,
      partyBottleId: number,
      wantToBuy: boolean,
    ): Promise<ApiResult<PartyDetail>> =>
      request<PartyDetail>(
        `party/${id}/bottle/${partyBottleId}/want-to-buy`,
        "PUT",
        JSON.stringify({ wantToBuy }),
      ),

    forBottle: (bottleId: number): Promise<ApiResult<BottleParty[]>> =>
      request<BottleParty[]>(`party/bottle/${bottleId}`, "GET"),

    wantToBuy: (): Promise<ApiResult<WantToBuyWine[]>> =>
      request<WantToBuyWine[]>("party/want-to-buy", "GET"),

    palate: (): Promise<ApiResult<PalateSummary>> =>
      request<PalateSummary>("party/palate", "GET"),
  };
}
