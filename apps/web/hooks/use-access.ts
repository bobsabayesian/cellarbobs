import { useApiQuery } from "@/hooks/use-api-query";
import { getMyAccess } from "@/lib/api/access";

/**
 * What the signed-in user may do with storages, so the UI can hide changes
 * they can't make (the server refuses them anyway). Until it has loaded,
 * everything is shown, so an admin's buttons don't flicker.
 */
export function useAccess() {
  const query = useApiQuery({
    queryKey: ["myAccess"],
    queryFn: getMyAccess,
  });
  const access = query.data;
  return {
    isAdmin: !access || access.isAdmin,
    /** Can this user add, change, move or remove bottles in this storage? */
    canEdit: (storageId: number | null | undefined) =>
      !access ||
      access.isAdmin ||
      (storageId !== null &&
        storageId !== undefined &&
        access.levels[storageId] === "edit"),
  };
}
