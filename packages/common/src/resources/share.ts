import type {
  BottleShareMark,
  CreateShareLink,
  ShareLinkDetail,
  ShareLinkSummary,
} from "@cellarboss/types";
import type { ApiResult, RequestFn } from "../types";

/** Host-side shared link endpoints (require a session). */
export function shareResource(request: RequestFn) {
  return {
    getAll: (): Promise<ApiResult<ShareLinkSummary[]>> =>
      request<ShareLinkSummary[]>("share", "GET"),

    getById: (id: number): Promise<ApiResult<ShareLinkDetail>> =>
      request<ShareLinkDetail>("share/" + id, "GET"),

    create: (data: CreateShareLink): Promise<ApiResult<ShareLinkDetail>> =>
      request<ShareLinkDetail>(
        "share",
        "POST",
        JSON.stringify({
          title: data.title,
          message: data.message ?? "",
          expiresAt: data.expiresAt,
          maxMarks:
            data.maxMarks === null || data.maxMarks === undefined
              ? null
              : Number(data.maxMarks),
        }),
      ),

    revoke: (id: number): Promise<ApiResult<ShareLinkDetail>> =>
      request<ShareLinkDetail>(`share/${id}/revoke`, "POST"),

    extend: (
      id: number,
      expiresAt: string,
    ): Promise<ApiResult<ShareLinkDetail>> =>
      request<ShareLinkDetail>(
        `share/${id}/extend`,
        "POST",
        JSON.stringify({ expiresAt }),
      ),

    delete: (id: number): Promise<ApiResult<{ success: boolean }>> =>
      request<{ success: boolean }>("share/" + id, "DELETE"),

    releaseMark: (
      id: number,
      markId: number,
    ): Promise<ApiResult<ShareLinkDetail>> =>
      request<ShareLinkDetail>(`share/${id}/mark/${markId}`, "DELETE"),

    forBottle: (bottleId: number): Promise<ApiResult<BottleShareMark[]>> =>
      request<BottleShareMark[]>(`share/bottle/${bottleId}`, "GET"),
  };
}
