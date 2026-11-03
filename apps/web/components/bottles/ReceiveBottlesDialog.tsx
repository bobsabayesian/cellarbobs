"use client";

import { useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import type { Storage } from "@cellarboss/types";
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
  /** Moves the bottles into the storage as stored; throws on failure. */
  onReceive: (storageId: number) => Promise<void>;
};

/** Picks the bin that arriving bottles go into. */
export function ReceiveBottlesDialog({
  count,
  storages,
  onReceive,
}: ReceiveBottlesDialogProps) {
  const [open, setOpen] = useState(false);
  const [storageId, setStorageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = { state: { value: storageId }, handleChange: setStorageId };

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
          options={storages}
          isInvalid={false}
          editable={true}
          field={field}
        />
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
