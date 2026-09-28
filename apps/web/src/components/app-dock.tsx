import { Link, useRouterState } from "@tanstack/react-router";

import { AccountMenu } from "#/components/account-menu.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { Dock, DockItem, DockSeparator } from "#/components/motion/dock.tsx";
import { ThemeToggle } from "#/components/motion/theme-toggle.tsx";
import { LayoutDashboard, Share2 } from "#/components/rune-icons.tsx";
import type { RuneIcon } from "#/components/rune-icons.tsx";
import { cn } from "#/lib/utils.ts";

const items = [
  { to: "/", label: "Share", icon: Share2 },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

const actionClassName =
  "flex size-full items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export interface DockAction {
  id: string;
  label: string;
  icon: RuneIcon;
  onClick: () => void;
  active: boolean;
}

const NO_ACTIONS: DockAction[] = [];

export function AppDock({ actions = NO_ACTIONS }: { actions?: DockAction[] }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const panelOpen = actions.some((action) => action.active);

  return (
    <nav
      aria-label="App dock"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center px-4",
        panelOpen ? "z-[90]" : "z-30"
      )}
    >
      <Dock
        size={actions.length > 0 ? 40 : 44}
        className={
          actions.length > 0
            ? "pointer-events-auto max-w-[calc(100vw-1rem)] [scrollbar-width:none] gap-0.5 overflow-x-auto overflow-y-hidden px-1 sm:gap-1.5 sm:px-2 [&::-webkit-scrollbar]:hidden"
            : "pointer-events-auto"
        }
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DockItem key={item.to} active={pathname === item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: true, includeSearch: false }}
                aria-label={item.label}
                title={item.label}
                className={actionClassName}
              >
                <Icon className="size-5" />
              </Link>
            </DockItem>
          );
        })}
        {actions.length > 0 ? <DockSeparator /> : null}
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DockItem key={action.id}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={action.label}
                aria-pressed={action.active}
                title={action.label}
                className={cn(
                  actionClassName,
                  "text-foreground hover:text-foreground hover:bg-transparent",
                  action.active && "bg-primary/10"
                )}
                whileHover={{}}
                onClick={() => action.onClick()}
              >
                <Icon className="size-5" />
              </Button>
            </DockItem>
          );
        })}
        <DockSeparator />
        <DockItem>
          <ThemeToggle
            className={actionClassName}
            iconClassName="size-5"
            start="bottom-up"
            variant="circle-blur"
          />
        </DockItem>
        <DockItem>
          <AccountMenu />
        </DockItem>
      </Dock>
    </nav>
  );
}
