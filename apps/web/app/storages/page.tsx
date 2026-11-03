"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Storage } from "@cellarboss/types";
import { buildTree, TreeNode } from "@/lib/functions/tree";
import { getStorages, deleteStorage, updateStorage } from "@/lib/api/storages";
import { getLocations } from "@/lib/api/locations";
import { getBottles } from "@/lib/api/bottles";
import {
  describeFree,
  getStorageAncestry,
  storageFill,
} from "@cellarboss/common/storages";
import { StorageFillBar } from "@/components/storage/StorageFillBar";
import {
  DataTable,
  FilterType,
  type BulkEditField,
  type FilterDef,
} from "@/components/datatable/components/DataTable";
import type {
  AppColumnDef,
  AppRow,
} from "@/components/datatable/tableFeatures";
import { EditButton } from "@/components/buttons/EditButton";
import { DeleteButton } from "@/components/buttons/DeleteButton";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page/PageHeader";
import { AddButton } from "@/components/buttons/AddButton";
import { useApiQuery } from "@/hooks/use-api-query";
import { useAccess } from "@/hooks/use-access";
import { queryGate } from "@/lib/functions/query-gate";

export default function StoragesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  async function handleEdit(row: Storage): Promise<void> {
    router.push(`/storages/${row.id}/edit`);
  }

  async function handleDelete(row: Storage): Promise<boolean> {
    const delResult = await deleteStorage(row.id);
    if (!delResult.ok)
      throw new Error("Error deleting storage: " + delResult.error.message);
    queryClient.invalidateQueries({ queryKey: ["storages"] });
    return true;
  }

  async function handleBulkDelete(rows: TreeNode<Storage>[]): Promise<void> {
    for (const row of rows) {
      const result = await deleteStorage(row.id);
      if (!result.ok)
        throw new Error("Error deleting storage: " + result.error.message);
    }
    queryClient.invalidateQueries({ queryKey: ["storages"] });
  }

  async function handleBulkEdit(
    rows: TreeNode<Storage>[],
    partial: Record<string, string | number>,
  ): Promise<void> {
    for (const row of rows) {
      const result = await updateStorage({
        id: row.id,
        name: row.name,
        locationId: row.locationId,
        parent: row.parent,
        ...(partial.locationId
          ? { locationId: Number(partial.locationId) }
          : {}),
        ...(partial.parent ? { parent: Number(partial.parent) } : {}),
      });
      if (!result.ok)
        throw new Error("Error updating storage: " + result.error.message);
    }
    queryClient.invalidateQueries({ queryKey: ["storages"] });
  }

  const storageQuery = useApiQuery({
    queryKey: ["storages"],
    queryFn: getStorages,
  });
  const locationQuery = useApiQuery({
    queryKey: ["locations"],
    queryFn: getLocations,
  });
  const bottleQuery = useApiQuery({
    queryKey: ["bottles"],
    queryFn: getBottles,
  });

  const access = useAccess();

  const result = queryGate([storageQuery, locationQuery, bottleQuery]);
  if (!result.ready) return result.gate;

  const [storagesList, locationList, bottles] = result.data;
  const fill = storageFill(storagesList, bottles);
  // Bins with room, most free first: where to put the next delivery.
  const storageMap = new Map(storagesList.map((s) => [s.id, s]));
  const withRoom = storagesList
    .filter((s) => s.capacity !== null && (fill.get(s.id)?.free ?? 0) > 0)
    .sort((a, b) => (fill.get(b.id)?.free ?? 0) - (fill.get(a.id)?.free ?? 0));
  const treeData = buildTree(storagesList, "parent");

  const bulkEditFields: BulkEditField<Storage>[] = [
    {
      key: "locationId",
      label: "Location",
      type: "select",
      options: locationList.map((l) => ({
        value: String(l.id),
        label: l.name,
      })),
    },
    {
      key: "parent",
      label: "Parent Storage",
      type: "select",
      options: storagesList.map((s) => ({
        value: String(s.id),
        label: s.name,
      })),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: FilterType.MultiSelect,
      columnId: "locationId",
      label: "Location",
      urlParamName: "locationId",
      options: locationList.map((l) => ({
        value: String(l.id),
        label: l.name,
      })),
    },
  ];

  const columns: AppColumnDef<TreeNode<Storage>>[] = [
    {
      accessorKey: "name",
      header: "Storage Name",
      enableColumnFilter: true,
      enableSorting: true,
      meta: { isHideable: false },
      cell: ({ row }) => {
        return <a href={"/storages/" + row.original.id}>{row.original.name}</a>;
      },
    },
    {
      accessorKey: "location",
      header: "Location",
      enableColumnFilter: false,
      enableSorting: true,
      sortFn: (
        rowA: AppRow<TreeNode<Storage>>,
        rowB: AppRow<TreeNode<Storage>>,
      ) => {
        const locationA = locationList.find(
          (l) => l.id === rowA.original.locationId,
        );
        const locationB = locationList.find(
          (l) => l.id === rowB.original.locationId,
        );
        const nameA = locationA?.name ?? "";
        const nameB = locationB?.name ?? "";
        return nameA.localeCompare(nameB);
      },
      cell: ({ row }) => {
        if (!row.original.locationId) return <span>-</span>;
        const location = locationList.filter(
          (l) => l.id === row.original.locationId,
        )[0];
        if (!location) return <span>-</span>;
        return <a href={"/locations/" + location.id}>{location.name}</a>;
      },
    },
    {
      id: "fill",
      header: "Bottles",
      enableColumnFilter: false,
      enableSorting: true,
      accessorFn: (row: TreeNode<Storage>) => fill.get(row.id)?.stored ?? 0,
      cell: ({ row }) => <StorageFillBar fill={fill.get(row.original.id)} />,
    },
    {
      // Hidden column used for filtering by location
      id: "locationId",
      header: "",
      enableColumnFilter: true,
      enableSorting: false,
      meta: { isSuppressed: true },
      accessorFn: (row: TreeNode<Storage>) => String(row.locationId ?? ""),
    },
    {
      accessorKey: "options",
      id: "options",
      header: "",
      size: 100,
      enableSorting: false,
      meta: { isHideable: false },
      cell: ({ row }) => {
        return (
          <div className="flex gap-1 justify-center mx-5">
            {access.canEdit(row.original.id) && (
              <>
                <EditButton onEdit={() => handleEdit(row.original)} />
                <DeleteButton
                  itemDescription={row.original.name}
                  onDelete={() => handleDelete(row.original)}
                />
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <section>
      <PageHeader title="Storages" />
      {withRoom.length > 0 && (
        <div className="mb-6 rounded-lg border p-4">
          <h2 className="font-semibold">Room to spare</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Storages with a capacity and space left, most free first.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {withRoom.slice(0, 9).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3"
              >
                <a
                  href={`/storages/${s.id}`}
                  className="truncate hover:underline"
                >
                  {getStorageAncestry(s.id, storageMap)
                    .map((x) => x.name)
                    .join(" › ")}
                </a>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {describeFree(fill.get(s.id))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <DataTable<TreeNode<Storage>>
        data={treeData}
        columns={columns}
        filterColumnName="name"
        defaultSortColumn="name"
        getSubRows={(row) => row.subRows}
        defaultExpanded={true}
        filters={filters}
        onBulkDelete={handleBulkDelete}
        bulkEditFields={bulkEditFields}
        onBulkEdit={handleBulkEdit}
        buttons={[
          <AddButton
            onClick={async () => router.push(`/storages/new`)}
            subject="Storage"
            key="add"
          />,
        ]}
      />
    </section>
  );
}
