"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { AccessLevel, StorageAccessOverview } from "@cellarboss/types";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import { getStorageAccess, setStorageAccess } from "@/lib/api/access";
import { PageHeader } from "@/components/page/PageHeader";

const LABEL: Record<AccessLevel, string> = { view: "View", edit: "Edit" };

type Row = {
  id: number;
  name: string;
  parent: number | null;
  depth: number;
  hasChildren: boolean;
};

/** Storages in tree order, each with its depth. */
function treeRows(storages: StorageAccessOverview["storages"]): Row[] {
  const ids = new Set(storages.map((s) => s.id));
  const byParent = new Map<number | null, typeof storages>();
  for (const s of storages) {
    const key = s.parent !== null && ids.has(s.parent) ? s.parent : null;
    byParent.set(key, [...(byParent.get(key) ?? []), s]);
  }
  const rows: Row[] = [];
  const walk = (parent: number | null, depth: number) => {
    const children = (byParent.get(parent) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    for (const s of children) {
      rows.push({
        id: s.id,
        name: s.name,
        parent: s.parent,
        depth,
        hasChildren: (byParent.get(s.id) ?? []).length > 0,
      });
      walk(s.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/**
 * Admin screen: who can see which storages. Access to a storage covers
 * everything inside it. The admin always sees everything.
 */
export default function StorageAccessPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // Storages whose contents are folded away.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const overviewQuery = useApiQuery({
    queryKey: ["storageAccess"],
    queryFn: getStorageAccess,
  });
  const result = queryGate([overviewQuery]);
  if (!result.ready) return result.gate;
  const [overview] = result.data;

  const people = overview.users.filter((u) => u.role !== "admin");
  const rows = treeRows(overview.storages);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const level = new Map(
    overview.grants.map((g) => [`${g.storageId}:${g.userId}`, g.level]),
  );

  const isHidden = (row: Row) => {
    let parent = row.parent;
    while (parent !== null) {
      if (collapsed.has(parent)) return true;
      parent = rowById.get(parent)?.parent ?? null;
    }
    return false;
  };
  const visibleRows = rows.filter((r) => !isHidden(r));
  const foldable = rows.filter((r) => r.hasChildren).map((r) => r.id);

  // How many grants sit inside each storage, per user, to show when folded.
  const inside = new Map<string, number>();
  for (const g of overview.grants) {
    let parent = rowById.get(g.storageId)?.parent ?? null;
    while (parent !== null) {
      const key = `${parent}:${g.userId}`;
      inside.set(key, (inside.get(key) ?? 0) + 1);
      parent = rowById.get(parent)?.parent ?? null;
    }
  }

  const toggle = (id: number) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** What a user gets on a storage from a storage above it, if anything. */
  const inherited = (storageId: number, userId: string) => {
    let parent = rowById.get(storageId)?.parent ?? null;
    let best: { level: AccessLevel; from: string } | null = null;
    while (parent !== null) {
      const l = level.get(`${parent}:${userId}`);
      if (l && (!best || (l === "edit" && best.level === "view")))
        best = { level: l, from: rowById.get(parent)?.name ?? "" };
      parent = rowById.get(parent)?.parent ?? null;
    }
    return best;
  };

  const change = async (storageId: number, userId: string, value: string) => {
    setError(null);
    const res = await setStorageAccess(
      storageId,
      userId,
      value === "" ? null : (value as AccessLevel),
    );
    if (!res.ok) return setError(res.error.message);
    queryClient.setQueryData(["storageAccess"], res.data);
  };

  return (
    <section className="space-y-4">
      <PageHeader title="Storage access" />
      <p className="text-sm text-muted-foreground">
        Choose who can see each storage. Access covers everything inside it, so
        sharing a rack shares its shelves. <strong>View</strong> is read-only;{" "}
        <strong>Edit</strong> lets them add, change, move and remove bottles.
        Admins always see everything. A storage someone adds is theirs alone
        until you share it here.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {foldable.length > 0 && (
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5"
            onClick={() => setCollapsed(new Set(foldable))}
          >
            Collapse all
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5"
            onClick={() => setCollapsed(new Set())}
          >
            Expand all
          </button>
        </div>
      )}

      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          There are no non-admin users yet. Add one under Users.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No storages yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">Storage</th>
                {people.map((u) => (
                  <th key={u.id} className="p-3 font-medium">
                    {u.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td
                    className="p-3"
                    style={{ paddingLeft: `${0.75 + row.depth * 1.25}rem` }}
                  >
                    {row.hasChildren ? (
                      <button
                        type="button"
                        aria-expanded={!collapsed.has(row.id)}
                        aria-label={`${collapsed.has(row.id) ? "Expand" : "Collapse"} ${row.name}`}
                        onClick={() => toggle(row.id)}
                        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted"
                      >
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${collapsed.has(row.id) ? "" : "rotate-90"}`}
                        />
                        {row.name}
                      </button>
                    ) : (
                      row.name
                    )}
                  </td>
                  {people.map((u) => {
                    const own = level.get(`${row.id}:${u.id}`) ?? "";
                    const via = own ? null : inherited(row.id, u.id);
                    return (
                      <td key={u.id} className="p-3">
                        <select
                          aria-label={`${u.name} access to ${row.name}`}
                          value={own}
                          onChange={(e) => change(row.id, u.id, e.target.value)}
                          className="h-9 rounded-md border bg-background px-2"
                        >
                          <option value="">None</option>
                          <option value="view">{LABEL.view}</option>
                          <option value="edit">{LABEL.edit}</option>
                        </select>
                        {collapsed.has(row.id) &&
                        inside.get(`${row.id}:${u.id}`) ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {inside.get(`${row.id}:${u.id}`)} set inside
                          </div>
                        ) : null}
                        {via && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {LABEL[via.level]} via {via.from}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
