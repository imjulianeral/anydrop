import { useAccountDevices } from "#/components/account-devices.tsx";
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
  const { signedIn, current } = useAccountDevices();
  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground tracking-eyebrow text-xs uppercase">
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
        {selfCardHint(signedIn, current)}
      </p>
    </section>
  );
}

function selfCardHint(
  signedIn: boolean,
  current: ReturnType<typeof useAccountDevices>["current"]
) {
  if (current === "mine") {
    return "Saved to your account. Your other saved devices can reach it from any network.";
  }
  if (current === "other_account") {
    return "Saved to another account. Devices on your network can still find it.";
  }
  if (signedIn) {
    return "Not saved to your account yet. Open Your devices in the dock to save it.";
  }
  return "Devices on your network appear automatically. Create an account to reach your own devices from anywhere.";
}
