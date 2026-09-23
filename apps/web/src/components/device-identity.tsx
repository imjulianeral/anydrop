import { Button } from "#/components/motion/button/base.tsx";
import { Copy } from "#/components/rune-icons.tsx";
import type { Peer } from "#/lib/api.ts";
import { island } from "#/lib/island.ts";

export function DeviceIdentity({ device }: { device: Peer }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs">Your invitation details</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void copyIdentity(device.display_name, "Nickname");
        }}
      >
        <Copy />
        <span className="truncate">{device.display_name}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy your user ID"
        onClick={() => {
          void copyIdentity(device.id, "User ID");
        }}
      >
        <Copy />
        <span className="truncate font-mono text-xs">{device.id}</span>
      </Button>
    </div>
  );
}

async function copyIdentity(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    island.notice({
      title: `${label} copied`,
      description: "Share it with someone so they can invite this device.",
      kind: "success",
    });
  } catch (error) {
    island.error("Could not copy", error);
  }
}
