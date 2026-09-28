import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useAccountSession } from "#/components/account-session.tsx";
import { AppDock } from "#/components/app-dock.tsx";
import { Figure, Panel, StatCard } from "#/components/dashboard/cards.tsx";
import {
  ActivityChart,
  KindRing,
  NearbyChart,
  TeamGrowthChart,
  WeekdayChart,
  growthSeries,
  nearbyBars,
} from "#/components/dashboard/charts.tsx";
import { CreateDrop } from "#/components/dashboard/create-drop.tsx";
import type { CreateView } from "#/components/dashboard/create-drop.tsx";
import { LiveLinks } from "#/components/dashboard/live-links.tsx";
import type { LinkSort } from "#/components/dashboard/live-links.tsx";
import { useDashboard } from "#/components/dashboard/use-dashboard.ts";
import { YearHeat } from "#/components/dashboard/year-heat.tsx";
import { LockedButton } from "#/components/devices-panel.tsx";
import { EmptyState } from "#/components/empty-state.tsx";
import { Button } from "#/components/motion/button/index.tsx";
import { Loader } from "#/components/motion/loader.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/motion/tabs.tsx";
import {
  Download,
  Eye,
  LayoutDashboard,
  Link2,
  Monitor,
  Plus,
  Send,
  Smartphone,
  Tablet,
} from "#/components/rune-icons.tsx";
import type { RuneIcon } from "#/components/rune-icons.tsx";
import {
  countsByKind,
  dashboardRanges,
  daysBetween,
  deriveView,
  kindLabels,
  selectionRange,
  seriesForRange,
  trend,
  weekdayTotals,
} from "#/lib/dashboard.ts";
import type {
  Dashboard,
  DashboardRange,
  DayRange,
  DaySelection,
  HeatMetric,
  KindFilter,
} from "#/lib/dashboard.ts";
import { formatBytes } from "#/lib/media.ts";
import { cn } from "#/lib/utils.ts";

const rangeLabels: Record<DashboardRange, string> = {
  7: "7d",
  30: "30d",
  90: "90d",
  365: "1y",
};

const kindFilters: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "text", label: kindLabels.text },
  { value: "file", label: kindLabels.file },
  { value: "url", label: kindLabels.url },
];

const deviceIcons: Record<string, RuneIcon> = {
  desktop: Monitor,
  phone: Smartphone,
  tablet: Tablet,
};

const number = new Intl.NumberFormat();

const scopeDescription = (data: Dashboard | null) => {
  if (!data) {
    return "Loading your activity…";
  }
  if (data.scope === "team" && data.team) {
    return `Everyone in ${data.team.name}, across their saved devices.`;
  }
  if (data.scope === "account") {
    const saved = data.devices?.saved ?? 0;
    return saved > 1
      ? `Across your ${saved} saved devices.`
      : "Across the devices saved to your account.";
  }
  return "Activity from this device. Sign in to see all your devices together.";
};

export function DashboardPage() {
  const { session } = useAccountSession();
  const user = session?.user ?? null;
  const [range, setRange] = useState<DashboardRange>(30);
  const [scope, setScope] = useState<"me" | "team">("me");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selection, setSelection] = useState<DaySelection | null>(null);
  const [createView, setCreateView] = useState<CreateView | null>(null);
  const { data, loading, error, token, addLink } = useDashboard(
    range,
    user?.team ? scope : "me"
  );
  const startDrop = () => setCreateView("choose");

  // The app layout pins itself to the viewport, so the dashboard scrolls itself.
  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-8 pb-(--app-dock-space) sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading flex items-center gap-2 text-lg">
              <LayoutDashboard aria-hidden="true" className="size-5" />
              Dashboard
            </h2>
            <p className="text-muted-foreground text-sm">
              {scopeDescription(data)}
            </p>
          </div>
          <ScopeSwitch
            scope={scope}
            signedIn={Boolean(user)}
            teamName={user?.team?.name ?? null}
            onScopeChange={(next) => {
              setScope(next);
              setSelection(null);
            }}
          />
        </header>

        <Filters
          kind={kind}
          range={range}
          onKindChange={setKind}
          onRangeChange={(next) => {
            setRange(next);
            setSelection(null);
          }}
        />

        {error ? (
          <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm">
            {error}
          </p>
        ) : null}

        {data ? (
          <DashboardBody
            data={data}
            kind={kind}
            loading={loading}
            selection={selection}
            signedIn={Boolean(user)}
            hasTeam={Boolean(user?.team)}
            token={token}
            onKindChange={setKind}
            onSelectionChange={(next) => {
              setSelection(next);
              // A span older than the loaded range needs the full year of rows.
              if (next && selectionRange(next).start < data.start) {
                setRange(365);
              }
            }}
            onShowTeam={() => setScope("team")}
            onStartDrop={startDrop}
          />
        ) : (
          <DashboardSkeleton />
        )}

        <CreateDrop
          view={createView}
          onCreated={addLink}
          onViewChange={setCreateView}
        />
        <AppDock />
      </main>
    </div>
  );
}

function Filters({
  kind,
  range,
  onKindChange,
  onRangeChange,
}: {
  kind: KindFilter;
  range: DashboardRange;
  onKindChange: (kind: KindFilter) => void;
  onRangeChange: (range: DashboardRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
        value={kind}
        variant="segment"
        onValueChange={(next) => onKindChange(next as KindFilter)}
      >
        <TabsList aria-label="Link type">
          {kindFilters.map((filter) => (
            <TabsTrigger key={filter.value} value={filter.value}>
              {filter.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Tabs
        value={String(range)}
        variant="segment"
        onValueChange={(next) => onRangeChange(Number(next) as DashboardRange)}
      >
        <TabsList aria-label="Time range">
          {dashboardRanges.map((days) => (
            <TabsTrigger key={days} value={String(days)}>
              {rangeLabels[days]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiSkeletons.map(({ label, icon }) => (
          <StatCard icon={icon} key={label} label={label} value={null} />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Activity">
          <ActivityChart loading series={[]} showCreated />
        </Panel>
        <Panel title="By type">
          <div className="flex flex-1 items-center justify-center py-10">
            <Loader label="Loading" variant="dots" />
          </div>
        </Panel>
      </div>
    </>
  );
}

const kpiSkeletons = [
  { label: "Views", icon: Eye },
  { label: "Downloads", icon: Download },
  { label: "Links created", icon: Link2 },
  { label: "Download rate", icon: Send },
];

function KpiRow({ view }: { view: ReturnType<typeof deriveView> }) {
  const { current, previous } = view;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Eye}
        label="Views"
        trend={previous ? trend(current.views, previous.views) : null}
        value={current.views}
      />
      <StatCard
        icon={Download}
        label="Downloads"
        trend={previous ? trend(current.downloads, previous.downloads) : null}
        value={current.downloads}
      />
      <StatCard
        icon={Link2}
        label="Links created"
        trend={previous ? trend(current.created, previous.created) : null}
        value={current.created}
      />
      <StatCard
        hint="Downloads per view on file links"
        icon={Send}
        label="Download rate"
        suffix="%"
        value={view.fileRate}
      />
    </div>
  );
}

function DashboardBody({
  data,
  kind,
  loading,
  selection,
  signedIn,
  hasTeam,
  token,
  onKindChange,
  onSelectionChange,
  onShowTeam,
  onStartDrop,
}: {
  data: Dashboard;
  kind: KindFilter;
  loading: boolean;
  selection: DaySelection | null;
  signedIn: boolean;
  hasTeam: boolean;
  token: string;
  onKindChange: (kind: KindFilter) => void;
  onSelectionChange: (selection: DaySelection | null) => void;
  onShowTeam: () => void;
  onStartDrop: () => void;
}) {
  const [heatMetric, setHeatMetric] = useState<HeatMetric>("both");
  const [sort, setSort] = useState<LinkSort>("recent");
  const selectedRange = selection ? selectionRange(selection) : null;
  const view = deriveView(data, kind, selectedRange);
  const onSelectedDays = selectedRange ? "on the selected days" : "over time";

  return (
    <>
      {view.empty ? (
        <Panel>
          <EmptyState
            action={
              <Button type="button" onClick={onStartDrop}>
                <Plus />
                Create your first drop
              </Button>
            }
            description="Share a message, file or link and its views and downloads show up here."
            icon={<Link2 />}
            title="Nothing shared yet"
          />
        </Panel>
      ) : null}

      <KpiRow view={view} />

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          description={`Views, downloads and links created ${onSelectedDays}.`}
          title="Activity"
        >
          <ActivityChart
            loading={loading}
            series={seriesForRange(view.kindDaily, view.focus)}
            showCreated
          />
        </Panel>
        <Panel description="Links created per type" title="By type">
          <KindRing
            byKind={countsByKind(view.daily)}
            metric="created"
            onSelect={(next) => onKindChange(next === kind ? "all" : next)}
          />
        </Panel>
      </div>

      <YearHeat
        end={data.end}
        metric={heatMetric}
        selectedRange={selectedRange}
        selection={selection}
        year={data.year}
        onMetricChange={setHeatMetric}
        onSelectionChange={onSelectionChange}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel description="When your links get opened" title="Busiest days">
          <WeekdayChart
            data={weekdayTotals(view.kindDaily)}
            loading={loading}
          />
        </Panel>
        <NearbyPanel data={data} loading={loading} view={view} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DevicesPanel data={data} signedIn={signedIn} />
        <TeamPanel
          data={data}
          focus={view.focus}
          hasTeam={hasTeam}
          onShowTeam={onShowTeam}
        />
      </div>

      <Panel
        action={
          <Tabs
            value={sort}
            variant="segment"
            onValueChange={(next) => setSort(next as LinkSort)}
          >
            <TabsList aria-label="Sort links">
              <TabsTrigger value="recent">Recent</TabsTrigger>
              <TabsTrigger value="views">Most opened</TabsTrigger>
            </TabsList>
          </Tabs>
        }
        description={
          selectedRange
            ? "Live links created on the selected days."
            : "Links that haven't expired yet."
        }
        title="Live links"
      >
        <LiveLinks
          emptyDescription="Create a message, link or file drop and it shows up here."
          emptyTitle={
            kind === "all"
              ? "No live links"
              : `No live ${kindLabels[kind].toLowerCase()} links`
          }
          links={view.links}
          sort={sort}
          token={token}
        />
      </Panel>
    </>
  );
}

function NearbyPanel({
  data,
  view,
  loading,
}: {
  data: Dashboard;
  view: ReturnType<typeof deriveView>;
  loading: boolean;
}) {
  // Byte totals cover the whole range, so they hide while days are selected.
  const wholeRange = view.focus.start === data.start;
  return (
    <Panel
      description="Messages and files sent straight to nearby devices"
      title="Nearby sharing"
    >
      <div className="grid grid-cols-2 gap-2">
        <Figure label="Sent" value={number.format(view.nearbySent)}>
          {wholeRange && data.nearby.bytes_sent > 0 ? (
            <span className="text-muted-foreground text-xs">
              {formatBytes(data.nearby.bytes_sent)} of files
            </span>
          ) : null}
        </Figure>
        <Figure label="Received" value={number.format(view.nearbyReceived)}>
          {wholeRange && data.nearby.bytes_received > 0 ? (
            <span className="text-muted-foreground text-xs">
              {formatBytes(data.nearby.bytes_received)} of files
            </span>
          ) : null}
        </Figure>
      </div>
      <NearbyChart
        bars={nearbyBars(view.nearbyDaily, daysBetween(view.focus))}
        loading={loading}
      />
    </Panel>
  );
}

function ScopeSwitch({
  scope,
  signedIn,
  teamName,
  onScopeChange,
}: {
  scope: "me" | "team";
  signedIn: boolean;
  teamName: string | null;
  onScopeChange: (scope: "me" | "team") => void;
}) {
  if (!signedIn) {
    return (
      <LockedButton size="sm" type="button" variant="outline">
        All my devices
      </LockedButton>
    );
  }
  if (!teamName) {
    return null;
  }
  return (
    <Tabs
      value={scope}
      variant="segment"
      onValueChange={(next) => onScopeChange(next === "team" ? "team" : "me")}
    >
      <TabsList aria-label="Whose activity">
        <TabsTrigger value="me">My devices</TabsTrigger>
        <TabsTrigger value="team">{teamName}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function DevicesPanel({
  data,
  signedIn,
}: {
  data: Dashboard | null;
  signedIn: boolean;
}) {
  if (!signedIn) {
    return (
      <Panel description="Reach them from anywhere" title="Your devices">
        <p className="text-muted-foreground text-sm">
          Save your phone, laptop and tablet to an account to see them here and
          send to them from anywhere.
        </p>
        <LockedButton type="button" variant="outline">
          Create a free account
        </LockedButton>
      </Panel>
    );
  }
  const devices = data?.devices;
  return (
    <Panel
      action={
        <Link
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          search={{ panel: "devices" }}
          to="/"
        >
          Manage
        </Link>
      }
      description="Saved to your account"
      title="Your devices"
    >
      <div className="grid grid-cols-2 gap-2">
        <Figure label="Saved" value={devices ? devices.saved : "—"} />
        <Figure label="Online now" value={devices ? devices.online : "—"} />
      </div>
      {devices && devices.list.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {devices.list.map((device) => {
            const Icon = deviceIcons[device.device_kind] ?? Monitor;
            return (
              <li
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm"
                key={device.id}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {device.display_name}
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    device.online ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      device.online ? "bg-success" : "bg-muted-foreground/40"
                    )}
                  />
                  {device.online ? "Online" : "Offline"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No devices saved yet. Open Your devices on the share page to save this
          one.
        </p>
      )}
    </Panel>
  );
}

function TeamPanel({
  data,
  focus,
  hasTeam,
  onShowTeam,
}: {
  data: Dashboard | null;
  focus: DayRange;
  hasTeam: boolean;
  onShowTeam: () => void;
}) {
  if (!hasTeam) {
    return (
      <Panel description="Enterprise" title="Team">
        <p className="text-muted-foreground text-sm">
          Teams let everyone reach each other&apos;s saved devices and see
          shared activity here. They&apos;re part of the enterprise plan.
        </p>
      </Panel>
    );
  }
  const team = data?.team;
  if (!team) {
    return (
      <Panel description="Enterprise" title="Team">
        <p className="text-muted-foreground text-sm">
          See members, invitations and your team&apos;s combined activity.
        </p>
        <Button type="button" variant="outline" onClick={onShowTeam}>
          Show team activity
        </Button>
      </Panel>
    );
  }
  return (
    <Panel
      action={
        <Link
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          search={{ panel: "team" }}
          to="/"
        >
          Manage team
        </Link>
      }
      description={team.role === "owner" ? "You own this team" : "Member"}
      title={team.name}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure label="Members" value={team.members} />
        <Figure label="Joined by invite" value={team.accepted_invitations} />
        <Figure label="Invites pending" value={team.pending_invitations} />
        <Figure
          label="Devices online"
          value={`${team.online_devices}/${team.devices}`}
        />
      </div>
      {team.growth.length > 0 ? (
        <TeamGrowthChart points={growthSeries(team.growth, focus)} />
      ) : null}
    </Panel>
  );
}
