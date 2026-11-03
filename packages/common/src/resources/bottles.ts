import type { Bottle, CreateBottle } from "@cellarboss/types";
import type { ApiResult, RequestFn } from "../types";

/**
 * Consumed fields are only sent when the caller supplied them, so a caller
 * that doesn't know about them (or a partial object) can't wipe stored values.
 * Empty form strings become null.
 */
function consumedFields(bottle: CreateBottle) {
  return {
    ...(bottle.consumedDate !== undefined && {
      consumedDate: bottle.consumedDate || null,
    }),
    ...(bottle.consumedNote !== undefined && {
      consumedNote: bottle.consumedNote || null,
    }),
  };
}

export function bottlesResource(request: RequestFn) {
  return {
    getAll: (): Promise<ApiResult<Bottle[]>> =>
      request<Bottle[]>("bottle", "GET"),

    getByVintageId: (vintageId: number): Promise<ApiResult<Bottle[]>> =>
      request<Bottle[]>("bottle/vintage/" + vintageId, "GET"),

    getCountsByVintageId: (
      vintageId: number,
    ): Promise<ApiResult<Array<{ status: string; count: number }>>> =>
      request<Array<{ status: string; count: number }>>(
        "bottle/vintage/" + vintageId + "/counts",
        "GET",
      ),

    getById: (id: number): Promise<ApiResult<Bottle>> =>
      request<Bottle>("bottle/" + id, "GET"),

    create: (bottle: CreateBottle): Promise<ApiResult<Bottle>> => {
      const body = {
        purchaseDate: bottle.purchaseDate,
        purchasePrice: Number(bottle.purchasePrice),
        vintageId: Number(bottle.vintageId),
        storageId: bottle.storageId ? Number(bottle.storageId) : null,
        status: bottle.status,
        size: bottle.size,
        ...consumedFields(bottle),
      };
      return request<Bottle>("bottle", "POST", JSON.stringify(body));
    },

    update: (
      bottle: CreateBottle & { id: number },
    ): Promise<ApiResult<Bottle>> => {
      const body = {
        purchaseDate: bottle.purchaseDate,
        purchasePrice: Number(bottle.purchasePrice),
        vintageId: Number(bottle.vintageId),
        storageId: bottle.storageId ? Number(bottle.storageId) : null,
        status: bottle.status,
        size: bottle.size,
        ...consumedFields(bottle),
      };
      return request<Bottle>(
        "bottle/" + bottle.id,
        "PUT",
        JSON.stringify(body),
      );
    },

    delete: (id: number): Promise<ApiResult<boolean>> =>
      request<boolean>("bottle/" + id, "DELETE"),
  };
}
