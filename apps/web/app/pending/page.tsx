"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import type { Bottle, Storage } from "@cellarboss/types";
import { getStorageAncestry, storageFill } from "@cellarboss/common/storages";
import { formatPrice, formatStatus } from "@cellarboss/common/format";
import { PENDING_STATUSES } from "@/lib/constants/pending";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSettingsContext } from "@/contexts/settings-context";
import { queryGate } from "@/lib/functions/query-gate";
import { invalidateVintageCounts } from "@/lib/functions/invalidate-vintage-counts";
import { wineDisplayName } from "@/lib/functions/strings";
import { getBottles, updateBottle } from "@/lib/api/bottles";
import { getVintages } from "@/lib/api/vintages";
import { getWines } from "@/lib/api/wines";
import { getWinemakers } from "@/lib/api/winemakers";
import { getStorages } from "@/lib/api/storages";
import { PageHeader } from "@/components/page/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ReceiveBottlesDialog } from "@/components/bottles/ReceiveBottlesDialog";

type Group = {
  vintageId: number;
  wineId: number;
  name: string;
  year: number | null;
  bottles: Bottle[];
};

export default function PendingPage() {
  const queryClient = useQueryClient();
  const settings = useSettingsContext();
  const currency = String(settings.get("currency") ?? "USD");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const queries = [
    useApiQuery({ queryKey: ["bottles"], queryFn: getBottles }),
    useApiQuery({ queryKey: ["vintages"], queryFn: getVintages }),
    useApiQuery({ queryKey: ["wines"], queryFn: getWines }),
    useApiQuery({ queryKey: ["winemakers"], queryFn: getWinemakers }),
    useApiQuery({ queryKey: ["storages"], queryFn: getStorages }),
  ] as const;
  const result = queryGate([...queries]);
  if (!result.ready) return result.gate;
  const [bottles, vintages, wines, winemakers, storages] = result.data;

  const vintageMap = new Map(vintages.map((v) => [v.id, v]));
  const wineMap = new Map(wines.map((w) => [w.id, w]));
  const makerMap = new Map(winemakers.map((m) => [m.id, m.name]));
  const storageMap = new Map<number, Storage>(storages.map((s) => [s.id, s]));

  const pending = bottles.filter((b) => PENDING_STATUSES.includes(b.status));
  const groups = new Map<number, Group>();
  for (const b of pending) {
    const vintage = vintageMap.get(b.vintageId);
    const wine = vintage ? wineMap.get(vintage.wineId) : undefined;
    const group = groups.get(b.vintageId) ?? {
      vintageId: b.vintageId,
      wineId: vintage?.wineId ?? 0,
      name: wineDisplayName(
        wine ? makerMap.get(wine.wineMakerId) : undefined,
        wine?.name ?? "Unknown wine",
      ),
      year: vintage?.year ?? null,
      bottles: [],
    };
    group.bottles.push(b);
    groups.set(b.vintageId, group);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const toggle = (ids: number[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const receive = async (storageId: number) => {
    const chosen = pending.filter((b) => selected.has(b.id));
    for (const bottle of chosen) {
      const res = await updateBottle({
        ...bottle,
        status: "stored",
        storageId,
      });
      if (!res.ok) throw new Error(res.error.message);
    }
    await queryClient.invalidateQueries({ queryKey: ["bottles"] });
    for (const vintageId of new Set(chosen.map((b) => b.vintageId))) {
      const vintage = vintageMap.get(vintageId);
      if (vintage) invalidateVintageCounts(queryClient, vintage);
    }
    const where = getStorageAncestry(storageId, storageMap)
      .map((s) => s.name)
      .join(" › ");
    setSelected(new Set());
    setMessage(
      `Received ${chosen.length} ${chosen.length === 1 ? "bottle" : "bottles"} into ${where}.`,
    );
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Pending"
        actions={
          <ReceiveBottlesDialog
            count={selected.size}
            storages={storages}
            fill={storageFill(storages, bottles)}
            onReceive={receive}
          />
        }
      />
      <p className="-mt-2 text-sm text-muted-foreground">
        Bottles on their way: ordered or bought en primeur. Tick the ones that
        arrived and choose the bin they&apos;re going into.
      </p>
      {message && (
        <p className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-sm">
          {message}
        </p>
      )}

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Truck className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nothing pending</p>
          <p className="text-sm text-muted-foreground">
            Bottles marked as ordered or in primeur show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sorted.map((group) => {
            const ids = group.bottles.map((b) => b.id);
            const allOn = ids.every((id) => selected.has(id));
            const someOn = ids.some((id) => selected.has(id));
            return (
              <li key={group.vintageId} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    aria-label={`Select all ${group.name} ${group.year ?? "NV"}`}
                    checked={allOn ? true : someOn ? "indeterminate" : false}
                    onCheckedChange={(v) => toggle(ids, v === true)}
                  />
                  <Link
                    href={`/vintages/${group.vintageId}`}
                    className="font-medium hover:underline"
                  >
                    {group.name} {group.year ?? "NV"}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {group.bottles.length}{" "}
                    {group.bottles.length === 1 ? "bottle" : "bottles"}
                  </span>
                </div>
                <ul className="ml-7 space-y-1">
                  {group.bottles.map((b) => (
                    <li key={b.id}>
                      <label className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                        <Checkbox
                          checked={selected.has(b.id)}
                          onCheckedChange={(v) => toggle([b.id], v === true)}
                        />
                        <Badge variant="secondary">
                          {formatStatus(b.status)}
                        </Badge>
                        <span className="text-muted-foreground">
                          bought {b.purchaseDate}
                          {b.purchasePrice > 0 &&
                            ` · ${formatPrice(b.purchasePrice, currency)}`}
                        </span>
                        <Link
                          href={`/bottles/${b.id}`}
                          className="text-muted-foreground hover:underline"
                        >
                          details
                        </Link>
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
