import { Link } from "@tanstack/react-router";
import { Link as LinkIcon, UsersRound } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { AppDock } from "#/components/app-dock.tsx";
import type { DockAction } from "#/components/app-dock.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import { CreateLinkPanel } from "#/components/create-link-panel.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { FileComposer } from "#/components/file-composer.tsx";
import { GroupManageModal } from "#/components/group-manage-modal.tsx";
import { GroupsPanel } from "#/components/groups-panel.tsx";
import { LinkDetails } from "#/components/link-details.tsx";
import { LinkHistoryPanel } from "#/components/link-history-panel.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "#/components/motion/popover-morph.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { PeerCarousel } from "#/components/peer-carousel.tsx";
import { RemoteDevicesPanel } from "#/components/remote-devices.tsx";
import { ArrowLeft, Monitor, Radio, X } from "#/components/rune-icons.tsx";
import { SelfCard } from "#/components/self-card.tsx";
import { SendOptions } from "#/components/send-options.tsx";
import { TextComposer } from "#/components/text-composer.tsx";
import { TransferHistory } from "#/components/transfer-history.tsx";
import type { Peer, ShortLink } from "#/lib/api.ts";
import { linkLabel } from "#/lib/link-label.ts";
import { SHARE_BACKGROUND_SHADER } from "#/lib/share-shaders.ts";
import { toast } from "#/lib/toast.ts";
import { useGroups } from "#/lib/use-groups.ts";
import { usePeerTransfers } from "#/lib/use-peer-transfers.ts";
import { useSendTransfers } from "#/lib/use-send-transfers.ts";
import { cn } from "#/lib/utils.ts";

interface ShareAppProps {
  peerId?: string;
  peerName?: string;
  messageId?: string;
  onSelectPeer: (peer: Peer) => void;
}

type SharePanel = "groups" | "invite" | "link" | "history" | "link-stats";

const panelLabels: Record<SharePanel, string> = {
  groups: "Your groups",
  invite: "Invite a device",
  link: "Create a link",
  history: "Link history",
  "link-stats": "Link activity",
};

const panelClassNames: Record<SharePanel, string> = {
  groups: "max-h-full max-w-md",
  invite: "max-h-full max-w-md overflow-y-auto overscroll-contain",
  link: "max-h-full max-w-sm overflow-y-auto overscroll-contain",
  history: "max-h-full max-w-md",
  "link-stats": "max-h-full max-w-lg overflow-y-auto overscroll-contain",
};

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
  const [fileComposerOpen, setFileComposerOpen] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [manageGroupId, setManageGroupId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<SharePanel | null>(null);
  const [createdLink, setCreatedLink] = useState<ShortLink | null>(null);
  const [statsLink, setStatsLink] = useState<ShortLink | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelTrigger = useRef<HTMLElement | null>(null);
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
  const showHistory =
    Boolean(targetId) &&
    !sendOptionsOpen &&
    (showShared || Boolean(!activeGroup && messageId));
  const showCarouselHint =
    !sendOptionsOpen && !targetId && peers.length + groups.length > 1;
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
      setPendingFiles([]);
      setFileComposerOpen(true);
    }
  };

  const openPanel = (panel: SharePanel) => {
    if (linkBusy) {
      return;
    }
    panelTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setActivePanel(panel);
  };

  const closePanel = () => {
    if (!linkBusy) {
      setActivePanel(null);
    }
  };

  const openGroupManager = (id: string | null) => {
    panelTrigger.current = null;
    setActivePanel(null);
    setCreatingGroup(id === null);
    setManageGroupId(id);
  };

  useEffect(() => {
    if (!activePanel) {
      return;
    }
    panelRef.current?.focus();
  }, [activePanel]);

  useEffect(() => {
    if (!activePanel) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !linkBusy) {
        event.preventDefault();
        setActivePanel(null);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = [
        ...(panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panelRef.current)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activePanel, linkBusy]);

  useEffect(() => {
    if (activePanel) {
      return;
    }
    panelTrigger.current?.focus({ preventScroll: true });
    panelTrigger.current = null;
  }, [activePanel]);

  const dockActions: DockAction[] = [
    {
      id: "groups",
      label: "Groups",
      icon: UsersRound,
      onClick: () => openPanel("groups"),
      active: activePanel === "groups",
    },
    {
      id: "invite",
      label: "Invite a device",
      icon: Radio,
      onClick: () => openPanel("invite"),
      active: activePanel === "invite",
    },
    {
      id: "link",
      label: "Create a link",
      icon: LinkIcon,
      onClick: () => openPanel("link"),
      active:
        activePanel === "link" ||
        activePanel === "history" ||
        activePanel === "link-stats",
    },
  ];

  return (
    <>
      <div
        className="bg-background relative isolate flex h-full min-h-0 flex-col overflow-hidden pb-(--app-dock-space)"
        onDragOver={(event) => {
          if (targetId) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (event.defaultPrevented) {
            return;
          }
          event.preventDefault();
          if (targetId && !sending) {
            setPendingFiles([...event.dataTransfer.files]);
            setFileComposerOpen(true);
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
        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-start px-5 py-5 sm:px-9 sm:py-7">
          <MorphPopover className="pointer-events-auto">
            <MorphPopoverTrigger>
              <Button
                variant="secondary"
                size="sm"
                aria-label={`This device: ${self.display_name}, ${connected ? "connected" : "disconnected"}. Show invitation details`}
              >
                <Monitor className="size-4" />
                <span className="max-w-32 truncate">{self.display_name}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    connected ? "bg-emerald-500" : "bg-destructive"
                  )}
                />
              </Button>
            </MorphPopoverTrigger>
            <MorphPopoverContent
              side="bottom"
              align="start"
              className="max-h-[70dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
            >
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
          {showHistory || sending || showCarouselHint ? (
            <div className="relative mx-auto flex w-full max-w-sm shrink-0 flex-col gap-4 pt-4 pb-6 sm:pb-8">
              {showHistory && targetId ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">
                      {targetName}
                      {activeGroup ||
                      peers.some((peer) => peer.id === selectedId)
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
                    visible
                    loading={loading}
                    transfers={transfers}
                    selfId={self.id}
                    peerName={targetName ?? "Device"}
                    messageId={activeGroup ? undefined : messageId}
                    participants={activeGroup?.members}
                  />
                </>
              ) : showCarouselHint ? (
                <p className="text-muted-foreground text-center text-xs">
                  Drag the space between circles, scroll, or use the arrow keys.
                </p>
              ) : null}
              {sending ? (
                <SendingProgress progress={progress} phase={phase} />
              ) : null}
            </div>
          ) : null}
        </main>
        <SendOptions
          open={sendOptionsOpen && Boolean(targetId)}
          onClose={() => setSendOptionsOpen(false)}
          onChoose={chooseAction}
        />
        <GroupManageModal
          group={managedGroup ?? null}
          creating={creatingGroup}
          peers={peers}
          selfId={self.id}
          token={token}
          refresh={refreshGroups}
          onClose={() => {
            setCreatingGroup(false);
            setManageGroupId(null);
          }}
          onCreated={(group) => {
            setCreatingGroup(false);
            setManageGroupId(group.id);
          }}
          onRemoved={() => {
            if (activeGroupId === manageGroupId) {
              setActiveGroupId(null);
            }
            setManageGroupId(null);
          }}
        />
        {fileComposerOpen ? (
          <FileComposer
            key={`files-${targetId}`}
            files={pendingFiles}
            sending={sending}
            onCancel={cancel}
            progress={progress}
            phase={phase}
            onClose={() => {
              setFileComposerOpen(false);
              setPendingFiles([]);
            }}
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
      <AppDock actions={dockActions} />
      <MorphingModal
        viewId={activePanel}
        onClose={closePanel}
        placement="bottom"
        className={activePanel ? panelClassNames[activePanel] : undefined}
      >
        {activePanel ? (
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={panelLabels[activePanel]}
            tabIndex={-1}
            className="outline-none"
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {activePanel === "groups" ? (
              <GroupsPanel
                groups={groups}
                loading={groupsLoading}
                error={groupsError}
                disabled={sending}
                onCreate={() => openGroupManager(null)}
                onOpenGroup={openGroupManager}
              />
            ) : null}
            {activePanel === "invite" ? <RemoteDevicesPanel /> : null}
            {activePanel === "link" ? (
              <CreateLinkPanel
                created={createdLink}
                onCreated={setCreatedLink}
                onBusyChange={setLinkBusy}
                onClose={closePanel}
                onViewHistory={() => setActivePanel("history")}
              />
            ) : null}
            {activePanel === "history" ? (
              <LinkHistoryPanel
                onBack={() => setActivePanel("link")}
                onDeleted={(code) => {
                  setCreatedLink((current) =>
                    current?.code === code ? null : current
                  );
                  setStatsLink((current) =>
                    current?.code === code ? null : current
                  );
                }}
                onStats={(link) => {
                  setStatsLink(link);
                  setActivePanel("link-stats");
                }}
              />
            ) : null}
            {activePanel === "link-stats" && statsLink ? (
              <div className="flex flex-col gap-5">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex w-fit cursor-pointer items-center gap-2 text-sm focus-visible:outline-2"
                  onClick={() => setActivePanel("history")}
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Link history
                </button>
                <LinkDetails
                  embedded
                  label={linkLabel(statsLink)}
                  link={statsLink}
                  token={token}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </MorphingModal>
    </>
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
