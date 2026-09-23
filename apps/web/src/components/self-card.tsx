import { DeviceIdentity } from "#/components/device-identity.tsx";
import { AnimatedBadge } from "#/components/motion/animated-badge.tsx";
import { Monitor, Smartphone, Tablet } from "#/components/rune-icons.tsx";
import type { Peer } from "#/lib/api.ts";

const kindIcon = {
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
} as const;

export function SelfCard({
  connected,
  device,
}: {
  connected: boolean;
  device: Peer;
}) {
  const Icon = kindIcon[device.device_kind];
  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
            This device
          </p>
          <h2 className="font-heading truncate text-lg tracking-tight">
            {device.display_name}
          </h2>
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Icon />
            {device.device_kind}
          </p>
        </div>
        <AnimatedBadge
          pulse={connected}
          size="sm"
          status={connected ? "success" : "warning"}
        >
          {connected ? "Live" : "Reconnecting"}
        </AnimatedBadge>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Devices on your network appear automatically. To connect from anywhere
        else, share your nickname or user ID and accept their invitation.
      </p>
      <DeviceIdentity device={device} />
    </section>
  );
}
