"use client";

import { useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import type { Storage } from "@cellarboss/types";
import type { StorageFill } from "@cellarboss/common/storages";
import { withFreeSpace } from "@/lib/functions/storage-labels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import HierarchicalSingleSelector from "@/components/selector/HierarchicalSingleSelector";

type ReceiveBottlesDialogProps = {
  count: number;
  storages: Storage[];
  /** Fill levels, to show free space and warn before overfilling. */
  fill?: Map<number, StorageFill>;
  /** Moves the bottles into the storage as stored; throws on failure. */
  onReceive: (storageId: number) => Promise<void>;
};

/** Picks the bin that arriving bottles go into. */
export function ReceiveBottlesDialog({
  count,
  storages,
  fill,
  onReceive,
}: ReceiveBottlesDialogProps) {
  const [open, setOpen] = useState(false);
  const [storageId, setStorageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = { state: { value: storageId }, handleChange: setStorageId };
  const chosen = storageId ? fill?.get(Number(storageId)) : undefined;
  const overfill =
    chosen && chosen.free !== null && chosen.free < count ? chosen.free : null;

  const receive = async () => {
    if (!storageId) return;
    setLoading(true);
    setError(null);
    try {
      await onReceive(Number(storageId));
      setOpen(false);
      setStorageId("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={count === 0}>
          <PackageCheck /> Receive {count || ""}{" "}
          {count === 1 ? "bottle" : "bottles"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Receive {count} {count === 1 ? "bottle" : "bottles"}
          </DialogTitle>
          <DialogDescription>
            Choose where they&apos;re going. They&apos;ll be marked as stored
            there.
          </DialogDescription>
        </DialogHeader>
        <HierarchicalSingleSelector
          options={withFreeSpace(storages, fill)}
          isInvalid={false}
          editable={true}
          field={field}
        />
        {overfill !== null && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {overfill <= 0
              ? "That storage is already full."
              : `Only ${overfill} free there.`}{" "}
            You can still receive them; it will show as over capacity.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={receive} disabled={!storageId || loading}>
            {loading && <Loader2 className="animate-spin" />} Receive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
