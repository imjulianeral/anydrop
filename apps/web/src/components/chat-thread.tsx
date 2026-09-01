import { useEffect, useRef } from "react";

import { buttonVariants } from "#/components/ui/button.tsx";
import { resolveAssetUrl, type Transfer } from "#/lib/api.ts";
import { cn } from "#/lib/utils.ts";

interface ChatThreadProps {
  selfId: string;
  transfers: Transfer[];
}

export function ChatThread({ selfId, transfers }: ChatThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transfers]);

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-6">
      {transfers.map((transfer) => {
        const mine = transfer.sender_id === selfId;
        const downloadUrl = transfer.download?.url
          ? resolveAssetUrl(transfer.download.url)
          : null;
        return (
          <article
            key={transfer.id}
            className={cn(
              "border-border/70 max-w-[min(100%,28rem)] rounded-3xl border px-4 py-3",
              mine
                ? "bg-secondary ml-auto"
                : "bg-card/80 mr-auto"
            )}
          >
            {transfer.kind === "text" ? (
              <p className="whitespace-pre-wrap text-sm">
                {transfer.body ?? ""}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {transfer.filename ?? "File"}
                </p>
                {downloadUrl ? (
                  <a
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                    download={transfer.filename ?? undefined}
                    href={downloadUrl}
                    rel="noopener"
                  >
                    Download
                  </a>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {transfer.status === "pending" ? "Uploading…" : "Not ready"}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
