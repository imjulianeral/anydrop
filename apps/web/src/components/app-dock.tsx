import type { ReactElement } from "react";

import { AccountMenu } from "#/components/account-menu.tsx";
import { useAccountSession } from "#/components/account-session.tsx";
import { Button } from "#/components/motion/button/base.tsx";
import { Dock, DockItem, DockSeparator } from "#/components/motion/dock.tsx";
import { ThemeToggle } from "#/components/motion/theme-toggle.tsx";
import { Tooltip } from "#/components/motion/tooltip.tsx";
import type { RuneIcon } from "#/components/rune-icons.tsx";
import { cn } from "#/lib/utils.ts";

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
  const panelOpen = actions.some((action) => action.active);
  const { session } = useAccountSession();

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
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DockItem key={action.id}>
              <DockTooltip label={action.label}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={action.label}
                  aria-pressed={action.active}
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
              </DockTooltip>
            </DockItem>
          );
        })}
        <DockSeparator />
        <DockItem>
          <DockTooltip label="Switch theme">
            <ThemeToggle
              className={actionClassName}
              iconClassName="size-5"
              start="bottom-up"
              variant="circle-blur"
            />
          </DockTooltip>
        </DockItem>
        <DockItem>
          <DockTooltip label={session?.user ? "Your account" : "Sign in"}>
            <AccountMenu />
          </DockTooltip>
        </DockItem>
      </Dock>
    </nav>
  );
}

/** Labels a dock button from above, filling the item so the hit area holds. */
function DockTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement;
}) {
  return (
    <Tooltip content={label} side="top" wrapperClassName="size-full">
      {children}
    </Tooltip>
  );
}
