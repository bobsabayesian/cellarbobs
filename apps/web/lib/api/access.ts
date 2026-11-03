"use server";

import type {
  AccessLevel,
  MyAccess,
  StorageAccessOverview,
} from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { api } from "./client";

export async function getStorageAccess(): Promise<
  ApiResult<StorageAccessOverview>
> {
  return api.access.getStorageAccess();
}

export async function setStorageAccess(
  storageId: number,
  userId: string,
  level: AccessLevel | null,
): Promise<ApiResult<StorageAccessOverview>> {
  return api.access.setStorageAccess(storageId, userId, level);
}

export async function getMyAccess(): Promise<ApiResult<MyAccess>> {
  return api.access.getMyAccess();
}
