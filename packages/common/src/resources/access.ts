import type { AccessLevel, StorageAccessOverview } from "@cellarboss/types";
import type { ApiResult, RequestFn } from "../types";

/** Admin-only: who can see which storages. */
export function accessResource(request: RequestFn) {
  return {
    getStorageAccess: (): Promise<ApiResult<StorageAccessOverview>> =>
      request<StorageAccessOverview>("access/storages", "GET"),

    /** Sets a user's access to a storage; null removes it. */
    setStorageAccess: (
      storageId: number,
      userId: string,
      level: AccessLevel | null,
    ): Promise<ApiResult<StorageAccessOverview>> =>
      request<StorageAccessOverview>(
        `access/storages/${storageId}/users/${encodeURIComponent(userId)}`,
        "PUT",
        JSON.stringify({ level }),
      ),
  };
}
