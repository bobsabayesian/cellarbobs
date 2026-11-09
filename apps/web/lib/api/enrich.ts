"use server";

import type {
  EnrichResult,
  EnrichRun,
  EnrichStatus,
  FillWindowsResult,
  VintageEnrichment,
} from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { api } from "./client";

export async function getVintageEnrichment(
  vintageId: number,
): Promise<ApiResult<VintageEnrichment>> {
  return api.enrich.getVintage(vintageId);
}

export async function lookupVintage(
  vintageId: number,
): Promise<ApiResult<EnrichResult>> {
  return api.enrich.lookupVintage(vintageId);
}

export async function getEnrichStatus(): Promise<ApiResult<EnrichStatus>> {
  return api.enrich.status();
}

export async function startEnrichRun(
  onlyMissing: boolean,
): Promise<ApiResult<EnrichRun>> {
  return api.enrich.startRun(onlyMissing);
}

export async function cancelEnrichRun(): Promise<ApiResult<EnrichRun | null>> {
  return api.enrich.cancelRun();
}

export async function fillDrinkingWindows(): Promise<
  ApiResult<FillWindowsResult>
> {
  return api.enrich.fillWindows();
}
