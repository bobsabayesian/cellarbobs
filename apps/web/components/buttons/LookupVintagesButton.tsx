"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import type { Vintage } from "@cellarboss/types";
import { lookupVintage } from "@/lib/api/enrich";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

/**
 * Admin only: looks up each of a wine's vintages online, one at a time.
 * Stops at the first request that fails outright (no key, bad key, quota).
 */
export function LookupVintagesButton({ vintages }: { vintages: Vintage[] }) {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (session.data?.user?.role !== "admin" || vintages.length === 0)
    return null;

  async function run() {
    setMessage(null);
    let found = 0;
    for (const [i, v] of vintages.entries()) {
      setProgress(i + 1);
      const result = await lookupVintage(v.id);
      if (!result.ok) {
        setMessage(result.error.message);
        break;
      }
      if (result.data.status === "ok") found++;
      await queryClient.invalidateQueries({ queryKey: ["enrichment", v.id] });
    }
    setProgress(null);
    setMessage((m) => m ?? `Found ${found} of ${vintages.length} online.`);
    await queryClient.invalidateQueries({ queryKey: ["vintages"] });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {message && (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={progress !== null}
        title="Look up scores, reviews and details for every vintage"
      >
        {progress !== null ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Globe className="h-4 w-4" />
        )}
        {progress !== null
          ? `Looking up ${progress} of ${vintages.length}…`
          : "Look up online"}
      </Button>
    </span>
  );
}
