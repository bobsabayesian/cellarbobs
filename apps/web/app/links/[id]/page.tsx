"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import type { ShareLinkDetail, ShareMarkDetail } from "@cellarboss/types";
import type { ApiResult } from "@cellarboss/common";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import {
  deleteShareLink,
  extendShareLink,
  getShareLink,
  releaseShareMark,
  revokeShareLink,
} from "@/lib/api/share";
import { PageHeader } from "@/components/page/PageHeader";
import { ConfirmButton } from "@/components/party/ConfirmButton";
import { CopyLink } from "@/components/share/CopyLink";
import {
  STATE_VARIANT,
  dateInputValue,
  endOfDay,
  formatExpiry,
  timeLeft,
} from "@/components/share/expiry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** One link: who's on it, and the pull list of marked bottles by bin. */
export default function ShareLinkPage() {
  const { id } = useParams<{ id: string }>();
  const linkId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newExpiry, setNewExpiry] = useState("");

  const linkQuery = useApiQuery({
    queryKey: ["shareLink", linkId],
    queryFn: () => getShareLink(linkId),
    refetchInterval: (q) => (q.state.data?.state === "active" ? 10000 : false),
  });
  const result = queryGate([linkQuery]);
  if (!result.ready) return result.gate;
  const [link] = result.data;

  const run = async (action: () => Promise<ApiResult<ShareLinkDetail>>) => {
    setError(null);
    const res = await action();
    if (!res.ok) {
      setError(res.error.message);
      return false;
    }
    queryClient.setQueryData(["shareLink", linkId], res.data);
    await queryClient.invalidateQueries({ queryKey: ["shareLinks"] });
    return true;
  };

  // Group the pull list by where the bottles are.
  const groups: { path: string; marks: ShareMarkDetail[] }[] = [];
  for (const mark of link.marks) {
    const path = mark.storagePath ?? "No storage";
    let group = groups.find((g) => g.path === path);
    if (!group) groups.push((group = { path, marks: [] }));
    group.marks.push(mark);
  }
  const gone = link.marks.filter((m) => !m.stillStored).length;

  return (
    <section className="space-y-6">
      <PageHeader
        title={link.title}
        actions={
          <Badge variant={STATE_VARIANT[link.state]}>{link.state}</Badge>
        }
      />
      <p className="-mt-3 text-sm text-muted-foreground">
        {link.state === "revoked"
          ? "Closed. The link no longer works."
          : link.state === "expired"
            ? `Expired ${formatExpiry(link.expiresAt)}. The link no longer works.`
            : `Works until ${formatExpiry(link.expiresAt)} (${timeLeft(link.expiresAt)})`}
        {link.maxMarks !== null &&
          ` · up to ${link.maxMarks} ${link.maxMarks === 1 ? "bottle" : "bottles"} each`}
      </p>

      {link.state === "active" && (
        <Card>
          <CardHeader>
            <CardTitle>Send this link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <CopyLink token={link.token} title={link.title} />
            <p className="text-sm text-muted-foreground">
              Anyone with it can browse and mark bottles under their name until
              it expires.
            </p>
          </CardContent>
        </Card>
      )}
      {link.message && (
        <blockquote className="border-l-2 pl-3 text-sm italic text-muted-foreground">
          {link.message}
        </blockquote>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>
            Pull list{" "}
            <span className="font-normal text-muted-foreground">
              {link.marks.length}{" "}
              {link.marks.length === 1 ? "bottle" : "bottles"}
            </span>
          </CardTitle>
          {gone > 0 && (
            <p className="text-sm text-muted-foreground">
              {gone} marked {gone === 1 ? "bottle has" : "bottles have"} already
              left storage.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {link.marks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing marked yet.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.path}>
                  <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {group.path}
                  </h3>
                  <ul className="divide-y rounded-lg border">
                    {group.marks.map((m) => (
                      <li
                        key={m.id}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-2 p-3",
                          !m.stillStored && "opacity-60",
                        )}
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/bottles/${m.bottleId}`}
                            className="font-medium hover:underline"
                          >
                            {m.wine.winemaker} {m.wine.wineName}{" "}
                            {m.wine.year ?? "NV"}
                          </Link>
                          <div className="text-sm text-muted-foreground">
                            for {m.guest}
                            {!m.stillStored && " · no longer stored"}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            run(() => releaseShareMark(linkId, m.id))
                          }
                        >
                          Release
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {link.guests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {link.guests.map((g) => (
                <li key={g.id} className="flex justify-between gap-2">
                  <span className="truncate">{g.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {g.markCount} marked
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Manage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run(() => extendShareLink(linkId, endOfDay(newExpiry))))
                setNewExpiry("");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="extend">
                {link.state === "active" ? "Change expiry" : "Reopen until"}
              </Label>
              <Input
                id="extend"
                type="date"
                required
                min={dateInputValue(new Date())}
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" disabled={!newExpiry}>
              {link.state === "active" ? "Update" : "Reopen"}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {link.state === "active" && (
              <ConfirmButton
                label="Close link now"
                variant="outline"
                title="Close this link?"
                description="The link stops working straight away. Marked bottles stay set aside until you release them or delete the link."
                confirmLabel="Close link"
                onConfirm={() => run(() => revokeShareLink(linkId))}
              />
            )}
            <ConfirmButton
              label="Delete link"
              variant="destructive"
              title="Delete this link?"
              description={`The link stops working and ${
                link.marks.length
                  ? `its ${link.marks.length} marked ${link.marks.length === 1 ? "bottle is" : "bottles are"} released`
                  : "nothing is set aside"
              }. Your bottles aren't changed.`}
              confirmLabel="Delete"
              onConfirm={async () => {
                const res = await deleteShareLink(linkId);
                if (!res.ok) {
                  setError(res.error.message);
                  return;
                }
                await queryClient.invalidateQueries({
                  queryKey: ["shareLinks"],
                });
                router.push("/links");
              }}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
