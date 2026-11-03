"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { getShareUrl } from "@/lib/api/share";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The link to send, with a copy button (and the share sheet on phones). */
export function CopyLink({ token, title }: { token: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const urlQuery = useApiQuery({
    queryKey: ["shareUrl", token],
    queryFn: () => getShareUrl(token),
    staleTime: Infinity,
  });
  const url = urlQuery.data ?? "";

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        readOnly
        value={url}
        aria-label="Link"
        className="min-w-0 flex-1 font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
      <Button type="button" variant="outline" onClick={copy} disabled={!url}>
        {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
      </Button>
      {canShare && (
        <Button
          type="button"
          variant="outline"
          disabled={!url}
          onClick={() => navigator.share({ title, url }).catch(() => {})}
        >
          Share…
        </Button>
      )}
    </div>
  );
}
