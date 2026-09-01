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
  selected: boolean;
  onSelect: (peer: Peer) => void;
}

export function PeerTile({ peer, selected, onSelect }: PeerTileProps) {
  const Icon = kindIcon[peer.device_kind];

  return (
    <button
      aria-current={selected ? "true" : undefined}
      aria-label={`Chat with ${peer.display_name}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:outline-none",
        selected ? "bg-muted" : null
      )}
      type="button"
      onClick={() => {
        onSelect(peer);
      }}
    >
      <Avatar>
        <AvatarFallback>{initials(peer.display_name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{peer.display_name}</span>
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Icon />
          {peer.device_kind}
        </span>
      </div>
    </button>
  );
}
