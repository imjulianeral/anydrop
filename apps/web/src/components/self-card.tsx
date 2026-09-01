import { Copy, Link2, Monitor, QrCode, Smartphone, Tablet } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field.tsx";
import { Input } from "#/components/ui/input.tsx";
import { toast } from "#/components/ui/toast.tsx";
import { createShortLink, shortPageUrl, type Peer } from "#/lib/api.ts";

const reportError = (error: unknown) => {
  toast.add({
    description: error instanceof Error ? error.message : undefined,
    title: "Could not update",
    type: "error",
  });
};

const kindIcon = {
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
} as const;

interface SelfCardProps {
  connected: boolean;
  device: Peer;
  token: string;
  onJoinRoom: (code: string | null) => Promise<void>;
  onRename: (name: string) => Promise<void>;
}

export function SelfCard({
  connected,
  device,
  token,
  onJoinRoom,
  onRename,
}: SelfCardProps) {
  const Icon = kindIcon[device.device_kind];
  const [name, setName] = useState(device.display_name);
  const [roomInput, setRoomInput] = useState(device.room_code ?? "");
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!device.room_code) {
      return;
    }
    const joinUrl = `${globalThis.location.origin}?room=${device.room_code}`;
    let cancelled = false;
    const renderQr = async () => {
      try {
        const dataUrl = await QRCode.toDataURL(joinUrl, {
          margin: 1,
          width: 120,
        });
        if (!cancelled) {
          setQr(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setQr(null);
        }
      }
    };
    void renderQr();
    return () => {
      cancelled = true;
    };
  }, [device.room_code]);

  const copyRoom = async () => {
    if (!device.room_code) {
      return;
    }
    await navigator.clipboard.writeText(device.room_code);
    toast.add({ title: "Room code copied", type: "success" });
  };

  const copyInviteLink = async () => {
    if (!device.room_code) {
      return;
    }
    const joinUrl = `${globalThis.location.origin}?room=${device.room_code}`;
    const created = await createShortLink(token, joinUrl);
    await navigator.clipboard.writeText(shortPageUrl(created.short_link.code));
    toast.add({ title: "Invite link copied", type: "success" });
  };

  return (
    <section className="border-border/70 flex flex-col gap-4 border-b p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
            This device
          </p>
          <h1 className="font-heading truncate text-lg tracking-tight">
            {device.display_name}
          </h1>
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            <Icon />
            {device.device_kind}
          </p>
        </div>
        <Badge variant={connected ? "secondary" : "outline"}>
          {connected ? "Live" : "Reconnecting"}
        </Badge>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="display-name">Display name</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="display-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <Button
              disabled={
                name.trim() === device.display_name || name.trim() === ""
              }
              variant="outline"
              onClick={() => {
                onRename(name.trim()).catch(reportError);
              }}
            >
              Save
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="room-code">Room code</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="room-code"
              maxLength={6}
              placeholder="Optional"
              value={roomInput}
              onChange={(event) => {
                setRoomInput(event.target.value.toUpperCase());
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                onJoinRoom(
                  roomInput.trim() === "" ? null : roomInput.trim()
                ).catch(reportError);
              }}
            >
              {device.room_code ? "Update" : "Join"}
            </Button>
          </div>
        </Field>
      </FieldGroup>

      {device.room_code ? (
        <div className="flex items-center gap-3">
          {qr ? (
            <img
              alt={`QR code for room ${device.room_code}`}
              className="bg-background size-16 rounded-xl p-1"
              src={qr}
            />
          ) : (
            <QrCode className="text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-mono text-lg tracking-[0.3em]">
              {device.room_code}
            </p>
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  copyRoom().catch(reportError);
                }}
              >
                <Copy data-icon="inline-start" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  copyInviteLink().catch(reportError);
                }}
              >
                <Link2 data-icon="inline-start" />
                Invite
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onJoinRoom(null).catch(reportError);
                }}
              >
                Leave
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            const code = crypto
              .randomUUID()
              .replaceAll("-", "")
              .slice(0, 6)
              .toUpperCase();
            setRoomInput(code);
            onJoinRoom(code).catch(reportError);
          }}
        >
          Create room
        </Button>
      )}
    </section>
  );
}
