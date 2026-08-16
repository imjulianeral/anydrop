import { Monitor, Smartphone, Tablet } from "lucide-react";

import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import type { Peer } from "#/lib/api.ts";
import { cn } from "#/lib/utils.ts";

const kindIcon = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
} as const;

const initials = (name: string): string =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

interface PeerTileProps {
  peer: Peer;
  onSelect: (peer: Peer) => void;
}

export function PeerTile({ peer, onSelect }: PeerTileProps) {
  const Icon = kindIcon[peer.device_kind];

  return (
    <button
      aria-label={`Send to ${peer.display_name}`}
      className={cn(
        "border-border/70 bg-card/70 flex w-36 flex-col items-center gap-3 rounded-3xl border p-5 text-center transition-colors",
        "hover:border-foreground/20 hover:bg-card focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none"
      )}
      onClick={() => {
        onSelect(peer);
      }}
      type="button"
    >
      <Avatar size="lg">
        <AvatarFallback>{initials(peer.display_name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate font-medium">{peer.display_name}</span>
        <span className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
          <Icon />
          {peer.device_kind}
        </span>
      </div>
    </button>
  );
}
