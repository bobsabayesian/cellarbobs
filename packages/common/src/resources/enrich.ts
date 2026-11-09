import type {
  EnrichResult,
  EnrichRun,
  EnrichStatus,
  FillWindowsResult,
  VintageEnrichment,
} from "@cellarboss/types";
import type { ApiResult, RequestFn } from "../types";

/** Wine data looked up online. Everything but reading is admin-only. */
export function enrichResource(request: RequestFn) {
  return {
    getVintage: (vintageId: number): Promise<ApiResult<VintageEnrichment>> =>
      request<VintageEnrichment>(`enrich/vintage/${vintageId}`, "GET"),

    /** Looks one vintage up now. Takes a while: the model searches the web. */
    lookupVintage: (vintageId: number): Promise<ApiResult<EnrichResult>> =>
      request<EnrichResult>(`enrich/vintage/${vintageId}`, "POST"),

    status: (): Promise<ApiResult<EnrichStatus>> =>
      request<EnrichStatus>("enrich/status", "GET"),

    startRun: (onlyMissing: boolean): Promise<ApiResult<EnrichRun>> =>
      request<EnrichRun>(
        "enrich/runs",
        "POST",
        JSON.stringify({ onlyMissing }),
      ),

    cancelRun: (): Promise<ApiResult<EnrichRun | null>> =>
      request<EnrichRun | null>("enrich/runs/cancel", "POST"),

    fillWindows: (): Promise<ApiResult<FillWindowsResult>> =>
      request<FillWindowsResult>("enrich/windows/fill", "POST"),
  };
}
