"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { getJoinCode } from "@/lib/api/parties";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** QR code guests scan to join, with the link to copy. */
export function JoinCode({
  token,
  large = false,
}: {
  token: string;
  large?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const codeQuery = useApiQuery({
    queryKey: ["partyJoinCode", token],
    queryFn: () => getJoinCode(token),
    staleTime: Infinity,
  });
  if (!codeQuery.data)
    return <div className={large ? "h-80 w-80" : "h-48 w-48"} />;
  const { svg, url } = codeQuery.data;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "rounded-lg bg-white p-2 [&_svg]:h-full [&_svg]:w-full",
          large ? "h-80 w-80" : "h-48 w-48",
        )}
        // SVG generated server-side by the qrcode package from our own URL.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {!large && (
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />} Copy guest link
        </Button>
      )}
    </div>
  );
}
