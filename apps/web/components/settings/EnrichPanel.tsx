"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EnrichStatus } from "@cellarboss/types";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  cancelEnrichRun,
  fillDrinkingWindows,
  getEnrichStatus,
  startEnrichRun,
} from "@/lib/api/enrich";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  done: "Finished",
  cancelled: "Cancelled",
  failed: "Stopped",
  interrupted: "Interrupted by a server restart",
};

/** Admin controls for looking up every vintage and filling windows. */
export function EnrichPanel() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const query = useApiQuery<EnrichStatus>({
    queryKey: ["enrichStatus"],
    queryFn: getEnrichStatus,
    // Poll while a run is going.
    refetchInterval: (q) =>
      q.state.data?.run?.status === "running" ? 3000 : false,
  });
  const status = query.data;
  const run = status?.run;
  const running = run?.status === "running";

  async function act(
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ) {
    setPending(true);
    setMessage(null);
    const result = await fn();
    if (!result.ok) setMessage(result.error?.message ?? "Failed");
    await queryClient.invalidateQueries({ queryKey: ["enrichStatus"] });
    setPending(false);
  }

  async function fill() {
    setPending(true);
    setMessage(null);
    const result = await fillDrinkingWindows();
    setMessage(
      result.ok
        ? `Filled ${result.data.filled} empty ${result.data.filled === 1 ? "window" : "windows"}.`
        : result.error.message,
    );
    await queryClient.invalidateQueries({ queryKey: ["vintages"] });
    setPending(false);
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <div>
        <div className="font-medium text-foreground">Online wine data</div>
        <div className="text-sm text-muted-foreground">
          Looks up critic scores, reviews and technical details for each vintage
          with {status?.model ?? "Gemini"} and Google Search. Each vintage is
          one or two API calls.
        </div>
      </div>

      {status && !status.configured && (
        <div className="text-sm text-destructive">
          Not set up: add GEMINI_API_KEY to the server&apos;s environment and
          restart it.
        </div>
      )}

      {run && (
        <div className="text-sm">
          <span className="font-medium">{STATUS_LABELS[run.status]}:</span>{" "}
          {run.done} of {run.total} looked up
          {run.failed > 0 && `, ${run.failed} failed`}
          {run.error && ` (${run.error})`}
          {running && (
            <div className="mt-2 h-2 rounded bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${run.total ? (run.done / run.total) * 100 : 0}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => act(cancelEnrichRun)}
          >
            Stop
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              disabled={pending || !status?.configured}
              onClick={() => act(() => startEnrichRun(true))}
            >
              Look up new vintages
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || !status?.configured}
              onClick={() => act(() => startEnrichRun(false))}
            >
              Refresh all
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" disabled={pending} onClick={fill}>
          Fill empty windows from other vintages
        </Button>
      </div>

      {message && (
        <div className="text-sm text-muted-foreground">{message}</div>
      )}
    </div>
  );
}
