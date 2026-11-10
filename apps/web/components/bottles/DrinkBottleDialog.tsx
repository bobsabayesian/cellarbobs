"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, NotebookPen, Wine } from "lucide-react";
import type { Bottle } from "@cellarboss/types";
import { updateBottle } from "@/lib/api/bottles";
import { invalidateVintageCounts } from "@/lib/functions/invalidate-vintage-counts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconButton } from "@/components/buttons/IconButton";
import { cn } from "@/lib/utils";

/** Statuses a bottle can be drunk from: it's in hand, not on order. */
const DRINKABLE = new Set<Bottle["status"]>(["stored", "in-tasting"]);

export function canDrink(bottle: Bottle) {
  return DRINKABLE.has(bottle.status);
}

function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Props = {
  /** Bottles to choose from; with more than one, the dialog asks which. */
  bottles: (Bottle & { label?: string })[];
  /** What's being drunk, e.g. "Barolo 2017". */
  name: string;
  wineId?: number;
  /** "icon" for table rows and page headers, "button" for phone cards. */
  variant?: "icon" | "button";
  className?: string;
};

/**
 * Marks a bottle drunk in one step: status, today's date and an optional
 * note, then offers to write a tasting note.
 */
export function DrinkBottleDialog({
  bottles,
  name,
  wineId,
  variant = "icon",
  className,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bottleId, setBottleId] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drunk, setDrunk] = useState<Bottle | null>(null);

  const candidates = bottles.filter(canDrink);
  if (candidates.length === 0) return null;
  const selected = candidates.find((b) => b.id === bottleId) ?? candidates[0];

  function handleOpenChange(next: boolean) {
    if (next) {
      setBottleId(candidates[0].id);
      setDate(today());
      setNote("");
      setError(null);
      setDrunk(null);
    }
    setOpen(next);
  }

  async function drink() {
    setSaving(true);
    setError(null);
    const result = await updateBottle({
      ...selected,
      status: "drunk",
      consumedDate: date || today(),
      consumedNote: note.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setDrunk(selected);
    queryClient.invalidateQueries({ queryKey: ["bottles"] });
    queryClient.invalidateQueries({ queryKey: ["bottle", selected.id] });
    if (wineId !== undefined)
      invalidateVintageCounts(queryClient, {
        id: selected.vintageId,
        wineId,
      });
  }

  function addNote() {
    if (!drunk) return;
    const back = window.location.pathname + window.location.search;
    setOpen(false);
    router.push(
      `/tasting-notes/new?vintageId=${drunk.vintageId}&returnTo=${encodeURIComponent(back)}`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {variant === "icon" ? (
        <IconButton icon={Wine} tooltip="Drink" trigger={DialogTrigger} />
      ) : (
        <DialogTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-3 text-[15px] font-medium touch-manipulation",
              className,
            )}
          >
            <Wine className="h-4 w-4" /> Drink
          </button>
        </DialogTrigger>
      )}
      <DialogContent>
        {drunk ? (
          <>
            <DialogHeader>
              <DialogTitle>Enjoy!</DialogTitle>
              <DialogDescription>
                {name} is marked as drunk. Write a tasting note while it&apos;s
                fresh?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
              <Button onClick={addNote}>
                <NotebookPen className="h-4 w-4" /> Add tasting note
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Drink {name}?</DialogTitle>
              <DialogDescription>Marks the bottle as drunk.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {candidates.length > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="drink-bottle">Which bottle</Label>
                  <select
                    id="drink-bottle"
                    value={selected.id}
                    onChange={(e) => setBottleId(Number(e.target.value))}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-base"
                  >
                    {candidates.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label || `Bottle #${b.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="drink-date">Date</Label>
                <Input
                  id="drink-date"
                  type="date"
                  value={date}
                  max={today()}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drink-note">Note (optional)</Label>
                <Textarea
                  id="drink-note"
                  value={note}
                  placeholder="Who with, what occasion…"
                  onChange={(e) => setNote(e.target.value)}
                  className="text-base"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={drink} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Drink"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
