import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { useAccountDevices } from "#/components/account-devices.tsx";
import { useAccountSession } from "#/components/account-session.tsx";
import { InlineRename } from "#/components/account/inline-rename.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import type { ButtonProps } from "#/components/motion/button/base.tsx";
import { StatefulButton } from "#/components/motion/button/stateful.tsx";
import { Input } from "#/components/motion/input.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { Tooltip } from "#/components/motion/tooltip.tsx";
import { Monitor, Smartphone, Tablet } from "#/components/rune-icons.tsx";
import {
  claimablePeers,
  MAX_DEVICE_NAME_LENGTH,
} from "#/lib/account-devices.ts";
import type { SavedDevice } from "#/lib/account-devices.ts";
import type { DeviceClaim, Peer } from "#/lib/api.ts";
import { attempt } from "#/lib/attempt.ts";
import { island } from "#/lib/island.ts";
import { cn } from "#/lib/utils.ts";

const GUEST_HINT =
  "Create a free account to save your devices and reach them from any network.";

const kindIcon = {
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
} as const;

/**
 * Save the devices you own. Saved devices reach each other from any network;
 * everything else is only visible on the same network. Guests see the same
 * panel with every option locked behind an account.
 */
export function DevicesPanel({
  savingPeerId = null,
}: {
  /** Opens this nearby device's save form right away. */
  savingPeerId?: string | null;
}) {
  const { self, peers } = useAppSession();
  const { signedIn, loading, error, devices, outgoing, current } =
    useAccountDevices();
  const nearby = claimablePeers(peers);
  const otherDevices = devices.filter((device) => device.id !== self.id);

  return (
    <section
      aria-label="Your devices"
      className="flex max-h-[min(36rem,calc(100dvh-var(--app-dock-space)-4rem))] flex-col gap-6 overflow-y-auto p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">Your devices</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Save the devices you own to reach them from any network. Other devices
          only appear when they’re on the same network as you.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <PanelSection title="This device">
        {signedIn && loading && current === null ? (
          <Loader label="Checking this device" variant="dots" />
        ) : (
          <ThisDevice />
        )}
      </PanelSection>

      <PanelSection title="Nearby devices">
        {nearby.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No unsaved devices on this network. Open Phemera on the device you
            want to add.
          </p>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Nearby devices">
            {nearby.map((peer) => (
              <NearbyDevice
                key={peer.id}
                peer={peer}
                startSaving={peer.id === savingPeerId}
                pending={outgoing.find((claim) => claim.target.id === peer.id)}
              />
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection title="Saved to your account">
        {signedIn ? (
          <SavedDevices devices={otherDevices} />
        ) : (
          <LockedButton variant="outline" size="sm">
            Show saved devices
          </LockedButton>
        )}
      </PanelSection>
    </section>
  );
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-muted-foreground tracking-eyebrow text-xs uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * A control guests can see but not use. Hovering, focusing or tapping it
 * explains why, and activating it opens account creation. It stays focusable
 * (`aria-disabled`, not `disabled`) so keyboard and pointer users both reach
 * the explanation.
 */
export function LockedButton({ className, children, ...props }: ButtonProps) {
  const { openAccountMenu } = useAccountSession();
  return (
    <Tooltip content={GUEST_HINT} side="top" wrapperClassName="w-fit">
      <Button
        {...props}
        aria-disabled="true"
        className={cn("cursor-not-allowed opacity-50", className)}
        onClick={() => openAccountMenu("signup")}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function ThisDevice() {
  const { self } = useAppSession();
  const { signedIn, current, saveThisDevice, rename } = useAccountDevices();
  const [name, setName] = useState(self.display_name);
  const [busy, setBusy] = useState(false);

  if (current === "other_account") {
    return (
      <div className="flex flex-col gap-2">
        <DeviceRow peer={self} detail="Saved to another account" />
        <p className="text-muted-foreground text-xs leading-relaxed">
          This device belongs to someone else, so it can’t be saved to your
          account. You can still share with nearby devices.
        </p>
      </div>
    );
  }

  if (current === "mine") {
    return (
      <DeviceRow peer={self} detail="Saved to your account">
        <InlineRename
          value={self.display_name}
          label="this device's name"
          busy={busy}
          maxLength={MAX_DEVICE_NAME_LENGTH}
          onSave={(next) => {
            setBusy(true);
            return attempt(
              async () => {
                await rename(self.id, next);
                return true;
              },
              {
                onError: (caught) => {
                  island.error("Could not rename this device", caught);
                  return false;
                },
                onSettled: () => setBusy(false),
              }
            );
          }}
        >
          <p className="truncate text-sm font-medium">{self.display_name}</p>
        </InlineRename>
      </DeviceRow>
    );
  }

  const save = async () => {
    setBusy(true);
    await attempt(
      async () => {
        await saveThisDevice(name.trim());
        island.notice({
          title: "Device saved",
          description: `${name.trim()} is now saved to your account.`,
          kind: "success",
        });
      },
      {
        onError: (caught) => island.error("Could not save this device", caught),
        onSettled: () => setBusy(false),
      }
    );
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (signedIn) {
          void save();
        }
      }}
    >
      <Input
        label="Name"
        value={signedIn ? name : self.display_name}
        onChange={setName}
        maxLength={MAX_DEVICE_NAME_LENGTH}
        readOnly={!signedIn}
        aria-disabled={signedIn ? undefined : "true"}
        disabled={busy}
        autoComplete="off"
      />
      {signedIn ? (
        <StatefulButton
          type="submit"
          state={busy ? "loading" : "idle"}
          loadingText="Saving"
          disabled={busy || !name.trim()}
        >
          Save this device
        </StatefulButton>
      ) : (
        <LockedButton className="w-full">Save this device</LockedButton>
      )}
    </form>
  );
}

function NearbyDevice({
  peer,
  startSaving,
  pending,
}: {
  peer: Peer;
  startSaving: boolean;
  pending: DeviceClaim | undefined;
}) {
  const { signedIn, askToSave, cancelRequest } = useAccountDevices();
  const [name, setName] = useState<string | null>(
    startSaving && signedIn ? peer.display_name : null
  );
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>, failure: string) => {
    setBusy(true);
    await attempt(task, {
      onError: (caught) => island.error(failure, caught),
      onSettled: () => setBusy(false),
    });
  };

  if (pending) {
    return (
      <DeviceRow
        as="li"
        peer={peer}
        detail={`Waiting for confirmation on ${peer.display_name}…`}
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => cancelRequest(pending.id),
                "Could not cancel the request"
              )
            }
          >
            Cancel
          </Button>
        }
      />
    );
  }

  if (name !== null) {
    const trimmed = name.trim();
    return (
      <li>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await askToSave(peer, trimmed);
              setName(null);
            }, "Could not send the request");
          }}
        >
          <Input
            label={`Save ${peer.display_name} as`}
            value={name}
            onChange={setName}
            maxLength={MAX_DEVICE_NAME_LENGTH}
            disabled={busy}
            autoComplete="off"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the Save button the person just pressed
            autoFocus
          />
          <p className="text-muted-foreground text-xs leading-relaxed">
            {peer.display_name} will be asked to confirm on its screen before
            it’s saved.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setName(null)}
            >
              Cancel
            </Button>
            <StatefulButton
              type="submit"
              size="sm"
              state={busy ? "loading" : "idle"}
              loadingText="Sending"
              disabled={busy || !trimmed}
            >
              Send request
            </StatefulButton>
          </div>
        </form>
      </li>
    );
  }

  return (
    <DeviceRow
      as="li"
      peer={peer}
      detail="On this network"
      action={
        signedIn ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setName(peer.display_name)}
          >
            Save
          </Button>
        ) : (
          <LockedButton variant="outline" size="sm">
            Save
          </LockedButton>
        )
      }
    />
  );
}

function SavedDevices({ devices }: { devices: SavedDevice[] }) {
  const { rename, remove } = useAccountDevices();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (devices.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No other saved devices yet. Save a nearby device, or sign in on your
        other devices and save them there.
      </p>
    );
  }

  const run = <T,>(
    id: string,
    task: () => Promise<T>,
    failure: string,
    fallback: T
  ) => {
    setBusyId(id);
    return attempt(task, {
      onError: (caught) => {
        island.error(failure, caught);
        return fallback;
      },
      onSettled: () => setBusyId(null),
    });
  };

  return (
    <ul className="flex flex-col gap-3" aria-label="Saved devices">
      {devices.map((device) => (
        <DeviceRow
          key={device.id}
          as="li"
          peer={device}
          detail={device.online ? "Online" : "Offline"}
          online={device.online}
          action={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${device.display_name} from your account`}
              disabled={busyId !== null}
              onClick={() =>
                void run(
                  device.id,
                  async () => {
                    await remove(device.id);
                    return true;
                  },
                  "Could not remove the device",
                  false
                )
              }
            >
              <Trash2 className="size-4" />
            </Button>
          }
        >
          <InlineRename
            value={device.display_name}
            label={`${device.display_name}'s name`}
            busy={busyId === device.id}
            maxLength={MAX_DEVICE_NAME_LENGTH}
            onSave={(next) =>
              run(
                device.id,
                async () => {
                  await rename(device.id, next);
                  return true;
                },
                "Could not rename the device",
                false
              )
            }
          >
            <p className="truncate text-sm font-medium">
              {device.display_name}
            </p>
          </InlineRename>
        </DeviceRow>
      ))}
    </ul>
  );
}

function DeviceRow({
  as: Tag = "div",
  peer,
  detail,
  online,
  action,
  children,
}: {
  as?: "div" | "li";
  peer: Peer;
  detail: string;
  online?: boolean;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const Icon = kindIcon[peer.device_kind];
  return (
    <Tag className="flex items-start gap-3">
      <span className="bg-muted relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-4" aria-hidden="true" />
        {online === undefined ? null : (
          <span
            aria-hidden="true"
            className={cn(
              "border-background absolute right-0 bottom-0 size-2.5 rounded-full border-2",
              online ? "bg-success" : "bg-muted-foreground"
            )}
          />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {children ?? (
          <p className="truncate text-sm font-medium">{peer.display_name}</p>
        )}
        <p className="text-muted-foreground text-xs">{detail}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </Tag>
  );
}
