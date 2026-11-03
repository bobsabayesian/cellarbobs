"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Link2, Plus } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { queryGate } from "@/lib/functions/query-gate";
import { createShareLink, getShareLinks } from "@/lib/api/share";
import { PageHeader } from "@/components/page/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  dateInputValue,
  endOfDay,
  STATE_VARIANT,
  formatExpiry,
  timeLeft,
} from "@/components/share/expiry";

/**
 * Shared links: send someone a link with timed access to the cellar so they
 * can mark bottles to set aside ("what should I bring to Thanksgiving?").
 */
export default function LinksPage() {
  const [creating, setCreating] = useState(false);
  const linksQuery = useApiQuery({
    queryKey: ["shareLinks"],
    queryFn: getShareLinks,
  });
  const result = queryGate([linksQuery]);
  if (!result.ready) return result.gate;
  const [links] = result.data;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Shared links"
        actions={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New link
            </Button>
          )
        }
      />

      {creating && <NewLinkForm onCancel={() => setCreating(false)} />}

      {links.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Link2 className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No shared links yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Send someone a link to browse your cellar for a while and mark the
            bottles they&apos;d like opened. Marked bottles are set aside, with
            a pull list sorted by bin.
          </p>
        </div>
      ) : (
        links.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {links.map((link) => (
              <li key={link.id}>
                <Link
                  href={`/links/${link.id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{link.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {link.state === "active"
                        ? `Expires ${timeLeft(link.expiresAt)}`
                        : link.state === "revoked"
                          ? "Closed"
                          : `Expired ${formatExpiry(link.expiresAt)}`}{" "}
                      · {link.guestCount}{" "}
                      {link.guestCount === 1 ? "person" : "people"} ·{" "}
                      {link.markCount} marked
                      {link.maxMarks !== null &&
                        ` · up to ${link.maxMarks} each`}
                    </div>
                  </div>
                  <Badge variant={STATE_VARIANT[link.state]}>
                    {link.state}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

function NewLinkForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState(() =>
    dateInputValue(new Date(Date.now() + 14 * 86_400_000)),
  );
  const [cap, setCap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await createShareLink({
      title: title.trim(),
      message: message.trim(),
      expiresAt: endOfDay(expires),
      maxMarks: cap ? Number(cap) : null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["shareLinks"] });
    router.push(`/links/${res.data.id}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New shared link</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="link-title">Title</Label>
            <Input
              id="link-title"
              required
              maxLength={120}
              placeholder="Thanksgiving"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="link-message">Message (optional)</Label>
            <Textarea
              id="link-message"
              maxLength={1000}
              placeholder="Pick a couple for dinner, we're doing turkey and ham."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-expires">Works until the end of</Label>
            <Input
              id="link-expires"
              type="date"
              required
              min={dateInputValue(new Date())}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="link-cap">Bottles each person can mark</Label>
            <Input
              id="link-cap"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              placeholder="No limit"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground sm:col-span-2">
            People with the link see your stored bottles, drinking windows, your
            tasting notes and where each bottle is. They don&apos;t see prices.
          </p>
          {error && (
            <p className="text-sm text-destructive sm:col-span-2">{error}</p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={saving || !title.trim()}>
              Create link
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
