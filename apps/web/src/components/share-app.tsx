import { Link } from "@tanstack/react-router";
import {
  Building2,
  Link as LinkIcon,
  MonitorSmartphone,
  Users,
  UsersRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { useAccountSession } from "#/components/account-session.tsx";
import { AppDock } from "#/components/app-dock.tsx";
import type { DockAction } from "#/components/app-dock.tsx";
import { useAppSession } from "#/components/app-session.tsx";
import { CreateLinkPanel } from "#/components/create-link-panel.tsx";
import { DashboardPanel } from "#/components/dashboard/dashboard-panel.tsx";
import { DevicesPanel } from "#/components/devices-panel.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { FileComposer } from "#/components/file-composer.tsx";
import { GroupManageModal } from "#/components/group-manage-modal.tsx";
import { GroupsPanel } from "#/components/groups-panel.tsx";
import { LinkDetails } from "#/components/link-details.tsx";
import { LinkHistoryPanel } from "#/components/link-history-panel.tsx";
import { BloomMenu } from "#/components/motion/bloom-menu.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { MorphingModal } from "#/components/motion/morphing-modal.tsx";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "#/components/motion/popover-morph.tsx";
import { ShaderBackground } from "#/components/motion/shader-background.tsx";
import { PeerCarousel } from "#/components/peer-carousel.tsx";
import {
  ArrowLeft,
  LayoutDashboard,
  Monitor,
  Radio,
  X,
} from "#/components/rune-icons.tsx";
import { SelfCard } from "#/components/self-card.tsx";
import { SendOptions } from "#/components/send-options.tsx";
import { TeamPanel } from "#/components/team-panel.tsx";
import { TextComposer } from "#/components/text-composer.tsx";
import { TransferHistory } from "#/components/transfer-history.tsx";
import type { DeviceGroup, Peer, ShortLink, Transfer } from "#/lib/api.ts";
import {
  defaultCircleFilter,
  groupsFor,
  peersFor,
} from "#/lib/circle-filter.ts";
import type { CircleFilter } from "#/lib/circle-filter.ts";
import { island } from "#/lib/island.ts";
import { linkLabel } from "#/lib/link-label.ts";
import { SHARE_BACKGROUND_SHADER } from "#/lib/share-shaders.ts";
import { useGroups } from "#/lib/use-groups.ts";
import { usePeerTransfers } from "#/lib/use-peer-transfers.ts";
import { useSendTransfers } from "#/lib/use-send-transfers.ts";
import { cn } from "#/lib/utils.ts";

interface ShareAppProps {
  peerId?: string;
  peerName?: string;
  messageId?: string;
  /** A panel to open on arrival, such as the dashboard. */
  initialPanel?: "dashboard" | "devices" | "team";
  onSelectPeer: (peer: Peer) => void;
}

type SharePanel =
  | "dashboard"
  | "groups"
  | "devices"
  | "team"
  | "link"
  | "history"
  | "link-stats";

/** Which panel Link activity returns to. */
type StatsOrigin = "history" | "dashboard";

const panelLabels: Record<SharePanel, string> = {
  dashboard: "Dashboard",
  groups: "Your groups",
  devices: "Your devices",
  team: "Team",
  link: "Create a link",
  history: "Link history",
  "link-stats": "Link activity",
};

const panelClassNames: Record<SharePanel, string> = {
  dashboard: "max-h-full max-w-6xl overflow-y-auto overscroll-contain",
  groups: "max-h-full max-w-md",
  devices: "max-h-full max-w-md overscroll-contain",
  team: "max-h-full max-w-md overscroll-contain",
  link: "max-h-full max-w-sm overflow-y-auto overscroll-contain",
  history: "max-h-full max-w-md",
  "link-stats": "max-h-full max-w-lg overflow-y-auto overscroll-contain",
};

export function ShareApp({
  peerId,
  peerName,
  messageId,
  initialPanel,
  onSelectPeer,
}: ShareAppProps) {
  const { token, self, peers, connected } = useAppSession();
  const hasTeam = useHasTeam();
  const { session: account, openAccountMenu } = useAccountSession();
  const [savingPeerId, setSavingPeerId] = useState<string | null>(null);
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
  const [activePanel, setActivePanel] = useState<SharePanel | null>(
    initialPanel ?? null
  );
  const [createdLink, setCreatedLink] = useState<ShortLink | null>(null);
  const [statsLink, setStatsLink] = useState<ShortLink | null>(null);
  const [statsOrigin, setStatsOrigin] = useState<StatsOrigin>("history");
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
  const { filter, setFilter, visiblePeers, visibleGroups, empty } =
    useCircleFilter(peers, groups, selected, activeGroup);
  const {
    online,
    peerHistoryId,
    groupId,
    targetId,
    targetName,
    recipients,
    showHistory,
    showCarouselHint,
  } = shareSelection({
    selected,
    activeGroup,
    selfId: self.id,
    messageId,
    showShared,
    sendOptionsOpen,
    peers,
    circleCount: visiblePeers.length + visibleGroups.length,
  });
  const { transfers, loading, appendTransfer } = usePeerTransfers(
    peerHistoryId,
    groupId
  );
  const { sending, progress, phase, sendText, sendFiles, cancel } =
    useSendTransfers({
      token,
      recipients,
      groupId,
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
      setSavingPeerId(null);
    }
  };

  // Guests can't save devices, so the Save action invites them to sign up.
  const savePeer = (peer: Peer) => {
    if (!account?.user) {
      openAccountMenu("signup");
      return;
    }
    setSavingPeerId(peer.id);
    openPanel("devices");
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
      const [first] = focusable;
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

  const dockActions: DockAction[] = shareDockActions(
    activePanel,
    statsOrigin,
    hasTeam
  ).map(({ panel, ...action }) => ({
    ...action,
    onClick: () => {
      setSavingPeerId(null);
      openPanel(panel);
    },
  }));

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
        <ShareBackdrop light={isLight} />
        <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-3 px-5 py-5 sm:flex-row sm:px-9 sm:py-7">
          <div className="flex w-full sm:w-auto sm:flex-1">
            <DeviceBadge self={self} connected={connected} />
          </div>
          <CircleSwitch
            filter={filter}
            organization={hasTeam}
            onFilterChange={setFilter}
          />
          <div aria-hidden="true" className="hidden sm:block sm:flex-1" />
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-24 sm:px-9 sm:pt-16">
          <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-9 py-8 sm:gap-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
                Your sharing space
              </h1>
              <output
                aria-live="polite"
                className="text-muted-foreground text-sm leading-relaxed"
              >
                {availabilityLabel(connected, peers.length)}
              </output>
            </div>
            {empty ? (
              <CircleEmptyState
                filter={filter}
                organization={hasTeam}
                onCreateGroup={() => openGroupManager(null)}
                onSignIn={() => openAccountMenu("signin")}
              />
            ) : (
              <PeerCarousel
                // A new list starts the carousel over at its first circle.
                key={filter}
                peers={visiblePeers}
                groups={visibleGroups}
                selectedId={peerHistoryId}
                selectedGroupId={groupId ?? null}
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
                onSavePeer={savePeer}
                onSendGroup={(group) => {
                  setActiveGroupId(group.id);
                  setShowShared(false);
                  if (!group.members.some((member) => member.id !== self.id)) {
                    island.error("Add another participant before sending");
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
            )}
          </div>
          {showHistory || sending || showCarouselHint ? (
            <div className="relative mx-auto flex w-full max-w-sm shrink-0 flex-col gap-4 pt-4 pb-6 sm:pb-8">
              {showHistory && targetId ? (
                <SelectionHistory
                  targetId={targetId}
                  targetName={targetName ?? "Device"}
                  group={activeGroup}
                  online={online}
                  messageId={messageId}
                  loading={loading}
                  transfers={transfers}
                  selfId={self.id}
                  onClearGroup={() => setActiveGroupId(null)}
                />
              ) : null}
              {showCarouselHint ? (
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
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Swallows file drops so they don't reach the page's drop zone.
          <div
            ref={panelRef}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native <dialog> stays hidden unless opened imperatively; MorphingModal drives this panel.
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
            <SharePanelBody
              panel={activePanel}
              groups={groups}
              groupsLoading={groupsLoading}
              groupsError={groupsError}
              sending={sending}
              createdLink={createdLink}
              statsLink={statsLink}
              statsOrigin={statsOrigin}
              savingPeerId={savingPeerId}
              token={token}
              onOpenGroupManager={openGroupManager}
              onCreatedLink={setCreatedLink}
              onStatsLink={setStatsLink}
              onStatsOrigin={setStatsOrigin}
              onLinkBusyChange={setLinkBusy}
              onPanelChange={setActivePanel}
              onClose={closePanel}
            />
          </div>
        ) : null}
      </MorphingModal>
    </>
  );
}

/** Enterprise accounts and team members get the Team panel in the dock. */
function useHasTeam() {
  const { session } = useAccountSession();
  const user = session?.user;
  return Boolean(user?.team || user?.plan === "enterprise");
}

function shareDockActions(
  activePanel: SharePanel | null,
  statsOrigin: StatsOrigin,
  hasTeam: boolean
) {
  // Link activity belongs to whichever panel opened it.
  const current =
    activePanel === "link-stats" && statsOrigin === "dashboard"
      ? "dashboard"
      : activePanel;
  const action = (
    panel: SharePanel,
    label: string,
    icon: DockAction["icon"]
  ) => ({
    id: panel,
    panel,
    label,
    icon,
    active: panel === "link" ? isLinkPanel(current) : current === panel,
  });
  return [
    action("groups", "Groups", UsersRound),
    action("devices", "Your devices", MonitorSmartphone),
    ...(hasTeam ? [action("team", "Team", Building2)] : []),
    action("link", "Create a link", LinkIcon),
    action("dashboard", "Dashboard", LayoutDashboard),
  ];
}

const LINK_PANELS = new Set<SharePanel | null>([
  "link",
  "history",
  "link-stats",
]);

function isLinkPanel(panel: SharePanel | null) {
  return LINK_PANELS.has(panel);
}

/**
 * The carousel's tab and what it shows. The tab stays unset until the viewer
 * picks one, so until then it follows the selection.
 */
function useCircleFilter(
  peers: Peer[],
  groups: DeviceGroup[],
  selected: Pick<Peer, "id" | "relation"> | null,
  activeGroup: DeviceGroup | undefined
) {
  const [picked, setPicked] = useState<CircleFilter | null>(null);
  const filter =
    picked ??
    defaultCircleFilter({
      peers,
      groups,
      selectedPeer: selected,
      selectedGroup: activeGroup ?? null,
    });
  const visiblePeers = peersFor(filter, peers);
  const visibleGroups = groupsFor(filter, groups);
  return {
    filter,
    setFilter: setPicked,
    visiblePeers,
    visibleGroups,
    empty: visiblePeers.length + visibleGroups.length === 0,
  };
}

/** Chooses which circles the carousel shows. */
function CircleSwitch({
  filter,
  organization,
  onFilterChange,
}: {
  filter: CircleFilter;
  /** Enterprise accounts see everyone else's devices as their organization. */
  organization: boolean;
  onFilterChange: (filter: CircleFilter) => void;
}) {
  return (
    <BloomMenu
      className="pointer-events-auto"
      anchor="top"
      title="Show"
      value={filter}
      onSelect={onFilterChange}
      items={[
        { value: "groups", label: "Groups", icon: UsersRound },
        { value: "mine", label: "Your devices", icon: MonitorSmartphone },
        organization
          ? { value: "others", label: "Organization", icon: Building2 }
          : { value: "others", label: "Friends", icon: Users },
      ]}
    />
  );
}

function CircleEmptyState({
  filter,
  organization,
  onCreateGroup,
  onSignIn,
}: {
  filter: CircleFilter;
  organization: boolean;
  onCreateGroup: () => void;
  onSignIn: () => void;
}) {
  const { session } = useAccountSession();
  const className =
    "bg-background/65 max-w-sm rounded-3xl p-6 backdrop-blur-md";
  if (filter === "groups") {
    return (
      <EmptyState
        className={className}
        icon={<UsersRound />}
        title="No groups yet"
        description="Make a group to send to several devices at once."
        action={
          <Button size="sm" onClick={onCreateGroup}>
            Create a group
          </Button>
        }
      />
    );
  }
  if (filter === "mine") {
    return session?.user ? (
      <EmptyState
        className={className}
        icon={<MonitorSmartphone />}
        title="None of your devices are online"
        description="Devices saved to your account show up here while they’re open."
      />
    ) : (
      <EmptyState
        className={className}
        icon={<MonitorSmartphone />}
        title="Reach your own devices"
        description="Sign in and save your phone, laptop and tablet to reach them from anywhere."
        action={
          <Button size="sm" onClick={onSignIn}>
            Sign in
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      className={className}
      icon={<Radio />}
      title="Waiting for another device"
      description={
        organization
          ? "Devices on the same network and your organization’s devices appear here."
          : "Devices on the same network appear here."
      }
    />
  );
}

function availabilityLabel(connected: boolean, count: number) {
  if (!connected) {
    return "Reconnecting…";
  }
  return `${count} ${count === 1 ? "device" : "devices"} available`;
}

/**
 * Who the next send goes to: the selected group, otherwise the selected
 * device, plus which parts of the space that selection shows.
 */
function shareSelection({
  selected,
  activeGroup,
  selfId,
  messageId,
  showShared,
  sendOptionsOpen,
  peers,
  circleCount,
}: {
  selected: ReturnType<typeof findSelectedPeer>;
  activeGroup: DeviceGroup | undefined;
  selfId: string;
  messageId: string | undefined;
  showShared: boolean;
  sendOptionsOpen: boolean;
  peers: Peer[];
  circleCount: number;
}) {
  const selectedId = selected?.id ?? null;
  const targetId = activeGroup?.id ?? selectedId;
  const deepLinked = Boolean(!activeGroup && messageId);
  let recipients: Pick<Peer, "id" | "display_name" | "public_key">[] = selected
    ? [selected]
    : [];
  if (activeGroup) {
    recipients = activeGroup.members.filter((member) => member.id !== selfId);
  }
  return {
    online: Boolean(
      activeGroup || peers.some((peer) => peer.id === selectedId)
    ),
    peerHistoryId: activeGroup ? null : selectedId,
    groupId: activeGroup?.id,
    targetId,
    targetName: activeGroup?.name ?? selected?.display_name,
    recipients,
    showHistory:
      Boolean(targetId) && !sendOptionsOpen && (showShared || deepLinked),
    showCarouselHint: !sendOptionsOpen && !targetId && circleCount > 1,
  };
}

function ShareBackdrop({ light }: { light: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <ShaderBackground
        className="absolute inset-0"
        colorBack={light ? "#ffffff" : "#0a0a0a"}
        colorFront={light ? "#0a0a0a" : "#ffffff"}
        colorMid="#47a6ff"
        speed={0.4}
        variant={SHARE_BACKGROUND_SHADER}
      />
      <div className="from-background/90 via-background/20 to-background/85 absolute inset-0 bg-linear-to-b" />
    </div>
  );
}

function DeviceBadge({ self, connected }: { self: Peer; connected: boolean }) {
  return (
    <MorphPopover className="pointer-events-auto">
      <MorphPopoverTrigger>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`This device: ${self.display_name}, ${connected ? "connected" : "disconnected"}. Show device details`}
        >
          <Monitor className="size-4" />
          <span className="max-w-32 truncate">{self.display_name}</span>
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              connected ? "bg-success" : "bg-destructive"
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
  );
}

function SelectionHistory({
  targetId,
  targetName,
  group,
  online,
  messageId,
  loading,
  transfers,
  selfId,
  onClearGroup,
}: {
  targetId: string;
  targetName: string;
  group: DeviceGroup | undefined;
  online: boolean;
  messageId: string | undefined;
  loading: boolean;
  transfers: Transfer[];
  selfId: string;
  onClearGroup: () => void;
}) {
  const historyKey = group
    ? `group-${targetId}-`
    : `peer-${targetId}-${messageId ?? ""}`;
  return (
    <>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate">
          {targetName}
          {online ? "" : " · Offline"}
        </span>
        {group ? (
          <button
            type="button"
            aria-label="Clear selected group"
            className="bg-background/70 flex size-8 shrink-0 items-center justify-center rounded-full"
            onClick={onClearGroup}
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
        key={historyKey}
        visible
        loading={loading}
        transfers={transfers}
        selfId={selfId}
        peerName={targetName}
        messageId={group ? undefined : messageId}
        participants={group?.members}
      />
    </>
  );
}

function SharePanelBody({
  panel,
  groups,
  groupsLoading,
  groupsError,
  sending,
  createdLink,
  statsLink,
  statsOrigin,
  savingPeerId,
  token,
  onOpenGroupManager,
  onCreatedLink,
  onStatsLink,
  onStatsOrigin,
  onLinkBusyChange,
  onPanelChange,
  onClose,
}: {
  panel: SharePanel;
  groups: DeviceGroup[];
  groupsLoading: boolean;
  groupsError: string | null;
  sending: boolean;
  createdLink: ShortLink | null;
  statsLink: ShortLink | null;
  statsOrigin: StatsOrigin;
  savingPeerId: string | null;
  token: string;
  onOpenGroupManager: (id: string | null) => void;
  onCreatedLink: Dispatch<SetStateAction<ShortLink | null>>;
  onStatsLink: Dispatch<SetStateAction<ShortLink | null>>;
  onStatsOrigin: (origin: StatsOrigin) => void;
  onLinkBusyChange: (busy: boolean) => void;
  onPanelChange: (panel: SharePanel) => void;
  onClose: () => void;
}) {
  const openStats = (link: ShortLink, origin: StatsOrigin) => {
    onStatsLink(link);
    onStatsOrigin(origin);
    onPanelChange("link-stats");
  };
  return (
    <>
      {panel === "dashboard" ? (
        <DashboardPanel
          onOpenLink={(link) => openStats(link, "dashboard")}
          onOpenPanel={onPanelChange}
        />
      ) : null}
      {panel === "groups" ? (
        <GroupsPanel
          groups={groups}
          loading={groupsLoading}
          error={groupsError}
          disabled={sending}
          onCreate={() => onOpenGroupManager(null)}
          onOpenGroup={onOpenGroupManager}
        />
      ) : null}
      {panel === "devices" ? (
        <DevicesPanel savingPeerId={savingPeerId} />
      ) : null}
      {panel === "team" ? <TeamPanel /> : null}
      {panel === "link" ? (
        <CreateLinkPanel
          created={createdLink}
          onCreated={onCreatedLink}
          onBusyChange={onLinkBusyChange}
          onClose={onClose}
          onViewHistory={() => onPanelChange("history")}
        />
      ) : null}
      {panel === "history" ? (
        <LinkHistoryPanel
          onBack={() => onPanelChange("link")}
          onDeleted={(code) => {
            onCreatedLink((current) =>
              current?.code === code ? null : current
            );
            onStatsLink((current) => (current?.code === code ? null : current));
          }}
          onStats={(link) => openStats(link, "history")}
        />
      ) : null}
      {panel === "link-stats" && statsLink ? (
        <div className="flex flex-col gap-5">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit cursor-pointer items-center gap-2 text-sm focus-visible:outline-2"
            onClick={() => onPanelChange(statsOrigin)}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {panelLabels[statsOrigin]}
          </button>
          <LinkDetails
            embedded
            label={linkLabel(statsLink)}
            link={statsLink}
            token={token}
          />
        </div>
      ) : null}
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
    <output
      aria-live="polite"
      className="bg-background/90 flex flex-col gap-2 rounded-2xl p-4"
    >
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
