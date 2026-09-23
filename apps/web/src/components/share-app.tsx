import { Link } from "@tanstack/react-router";
import { useTheme } from "next-themes";
import { useRef, useState } from "react";

import { useAppSession } from "#/components/app-session.tsx";
import { DeviceGroups } from "#/components/device-groups.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { FileComposer } from "#/components/file-composer.tsx";
import { GroupManageModal } from "#/components/group-manage-modal.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "#/components/motion/popover-morph.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { PeerCarousel } from "#/components/peer-carousel.tsx";
import { RemoteDevices } from "#/components/remote-devices.tsx";
import { Monitor, Radio, X } from "#/components/rune-icons.tsx";
import { SelfCard } from "#/components/self-card.tsx";
import { SendOptions } from "#/components/send-options.tsx";
import { TextComposer } from "#/components/text-composer.tsx";
import { TransferHistory } from "#/components/transfer-history.tsx";
import type { Peer } from "#/lib/api.ts";
import { SHARE_BACKGROUND_SHADER } from "#/lib/share-shaders.ts";
import { toast } from "#/lib/toast.ts";
import { useGroups } from "#/lib/use-groups.ts";
import { usePeerTransfers } from "#/lib/use-peer-transfers.ts";
import { useSendTransfers } from "#/lib/use-send-transfers.ts";

interface ShareAppProps {
  peerId?: string;
  peerName?: string;
  messageId?: string;
  onSelectPeer: (peer: Peer) => void;
}

export function ShareApp({
  peerId,
  peerName,
  messageId,
  onSelectPeer,
}: ShareAppProps) {
  const { token, self, peers, connected } = useAppSession();
  const selected = findSelectedPeer(peers, peerId, peerName);
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const [composeText, setComposeText] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showShared, setShowShared] = useState(false);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [dialogGroupId, setDialogGroupId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    groups,
    loading: groupsLoading,
    error: groupsError,
    refresh: refreshGroups,
  } = useGroups();
  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const managedGroup = groups.find((group) => group.id === manageGroupId);
  const selectedId = selected?.id ?? null;
  const targetId = activeGroup?.id ?? selectedId;
  const targetName = activeGroup?.name ?? selected?.display_name;
  const recipients =
    activeGroup?.members.filter((member) => member.id !== self.id) ??
    (selected ? [selected] : []);
  const { transfers, loading, appendTransfer } = usePeerTransfers(
    activeGroup ? null : selectedId,
    activeGroup?.id
  );
  const { sending, progress, phase, sendText, sendFiles, cancel } =
    useSendTransfers({
      token,
      recipients,
      groupId: activeGroup?.id,
      onTransfer: appendTransfer,
    });

  const chooseAction = (kind: "text" | "file") => {
    if (kind === "text") {
      setComposeText(true);
    } else {
      fileInput.current?.click();
    }
  };

  return (
    <div
      className="bg-background relative isolate flex h-full min-h-0 flex-col overflow-hidden pb-(--app-dock-space)"
      onDragOver={(event) => {
        if (targetId) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (targetId && !sending) {
          setPendingFiles([...event.dataTransfer.files]);
        }
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <ShaderBackground
          className="absolute inset-0"
          colorBack={isLight ? "#ffffff" : "#0a0a0a"}
          colorFront={isLight ? "#0a0a0a" : "#ffffff"}
          colorMid="#47a6ff"
          speed={0.4}
          variant={SHARE_BACKGROUND_SHADER}
        />
        <div className="from-background/90 via-background/20 to-background/85 absolute inset-0 bg-linear-to-b" />
      </div>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-9 sm:py-7">
        <RemoteDevices />
        <DeviceGroups
          disabled={sending}
          groups={groups}
          loading={groupsLoading}
          error={groupsError}
          refresh={refreshGroups}
          open={groupsOpen}
          onOpenChange={setGroupsOpen}
          selectedId={dialogGroupId}
          onSelectGroup={setDialogGroupId}
        />
        <MorphPopover>
          <MorphPopoverTrigger>
            <Button
              variant="secondary"
              size="sm"
              aria-label="This device and invitation details"
            >
              <Monitor className="size-4" />
              <span className="max-w-32 truncate">{self.display_name}</span>
            </Button>
          </MorphPopoverTrigger>
          <MorphPopoverContent className="max-h-[70dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto">
            <SelfCard connected={connected} device={self} />
          </MorphPopoverContent>
        </MorphPopover>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 sm:px-9">
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-9 py-8 sm:gap-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
              Your sharing space
            </h1>
            <output className="text-muted-foreground text-sm leading-relaxed">
              {connected
                ? `${peers.length} ${peers.length === 1 ? "device" : "devices"} available`
                : "Reconnecting…"}
            </output>
          </div>
          {peers.length || groups.length ? (
            <PeerCarousel
              peers={peers}
              groups={groups}
              selectedId={activeGroup ? null : selectedId}
              selectedGroupId={activeGroup?.id ?? null}
              disabled={sending}
              onSelect={(peer) => {
                setActiveGroupId(null);
                onSelectPeer(peer);
              }}
              onSend={() => {
                setShowShared(false);
                setSendOptionsOpen(true);
              }}
              onShowItems={() => setShowShared(true)}
              onSendGroup={(group) => {
                setActiveGroupId(group.id);
                setDialogGroupId(group.id);
                setShowShared(false);
                if (!group.members.some((member) => member.id !== self.id)) {
                  toast.add({
                    title: "Add another participant before sending",
                    type: "error",
                  });
                  return;
                }
                setSendOptionsOpen(true);
              }}
              onShowGroupItems={(group) => {
                setActiveGroupId(group.id);
                setDialogGroupId(group.id);
                setShowShared(true);
                setSendOptionsOpen(false);
              }}
              onManageGroup={(group) => setManageGroupId(group.id)}
            />
          ) : (
            <EmptyState
              className="bg-background/65 max-w-sm rounded-3xl p-6 backdrop-blur-md"
              icon={<Radio />}
              title="Waiting for another device"
              description="Nearby devices appear on the same network. Use Invite a device to reach someone anywhere by their exact nickname or user ID."
            />
          )}
        </div>
        <div className="relative mx-auto flex w-full max-w-sm shrink-0 flex-col gap-4 pt-4 pb-6 sm:pb-8">
          {targetId ? (
            <>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">
                  {targetName}
                  {activeGroup || peers.some((peer) => peer.id === selectedId)
                    ? ""
                    : " · Offline"}
                </span>
                {activeGroup ? (
                  <button
                    type="button"
                    aria-label="Clear selected group"
                    className="bg-background/70 flex size-8 shrink-0 items-center justify-center rounded-full"
                    onClick={() => setActiveGroupId(null)}
                  >
                    <X className="size-4" />
                  </button>
                ) : (
                  <Link
                    to="/"
                    search={(previous) => ({
                      ...previous,
                      peer: undefined,
                      peerName: undefined,
                      message: undefined,
                    })}
                    aria-label="Clear selected device"
                    className="bg-background/70 flex size-8 shrink-0 items-center justify-center rounded-full"
                  >
                    <X className="size-4" />
                  </Link>
                )}
              </div>
              <TransferHistory
                key={`${activeGroup ? "group" : "peer"}-${targetId}-${activeGroup ? "" : (messageId ?? "")}`}
                visible={showShared || Boolean(!activeGroup && messageId)}
                loading={loading}
                transfers={transfers}
                selfId={self.id}
                peerName={targetName ?? "Device"}
                messageId={activeGroup ? undefined : messageId}
                participants={activeGroup?.members}
              />
            </>
          ) : peers.length + groups.length > 1 ? (
            <p className="text-muted-foreground text-center text-xs">
              Drag the space between circles, scroll, or use the arrow keys.
            </p>
          ) : null}
          {sending ? (
            <SendingProgress progress={progress} phase={phase} />
          ) : null}
        </div>
      </main>
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        aria-label="Files to share"
        disabled={sending}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          setPendingFiles(files);
        }}
      />
      <SendOptions
        open={sendOptionsOpen && Boolean(targetId)}
        onClose={() => setSendOptionsOpen(false)}
        onChoose={chooseAction}
      />
      <GroupManageModal
        group={managedGroup ?? null}
        peers={peers}
        selfId={self.id}
        token={token}
        refresh={refreshGroups}
        onClose={() => setManageGroupId(null)}
        onRemoved={() => {
          if (activeGroupId === manageGroupId) {
            setActiveGroupId(null);
          }
          setDialogGroupId(null);
          setManageGroupId(null);
        }}
      />
      {pendingFiles.length > 0 ? (
        <FileComposer
          key={`files-${targetId}`}
          files={pendingFiles}
          sending={sending}
          onCancel={cancel}
          progress={progress}
          phase={phase}
          onClose={() => setPendingFiles([])}
          onSend={sendFiles}
        />
      ) : null}
      {targetId ? (
        <TextComposer
          key={`text-${targetId}`}
          open={composeText}
          onOpenChange={setComposeText}
          peerName={targetName ?? "Device"}
          sending={sending}
          onSend={sendText}
        />
      ) : null}
    </div>
  );
}

function findSelectedPeer(peers: Peer[], peerId?: string, peerName?: string) {
  if (!peerId) {
    return null;
  }
  return (
    peers.find((peer) => peer.id === peerId) ?? {
      id: peerId,
      display_name: peerName ?? "Device",
      public_key: null,
    }
  );
}

function SendingProgress({
  progress,
  phase,
}: {
  progress: number | null;
  phase: string;
}) {
  return (
    <output className="bg-background/90 flex flex-col gap-2 rounded-2xl p-4">
      <span className="text-xs">
        {progress === null
          ? "Sending…"
          : `${phase} · ${Math.round(progress * 100)}%`}
      </span>
      {progress === null ? null : (
        <progress
          className="share-upload-progress h-1 w-full"
          aria-label="File upload"
          value={progress}
          max={1}
        />
      )}
    </output>
  );
}
