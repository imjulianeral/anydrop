import { Link, useRouterState } from "@tanstack/react-router";

import { Dock, DockItem, DockSeparator } from "#/components/motion/dock.tsx";
import { ThemeToggle } from "#/components/motion/theme-toggle.tsx";
import { Link2, Share2 } from "#/components/rune-icons.tsx";

const items = [
  { to: "/", label: "Share", icon: Share2 },
  { to: "/links", label: "Links", icon: Link2 },
] as const;

const actionClassName =
  "flex size-full items-center justify-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function AppDock() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <nav
      aria-label="Main navigation"
      className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
    >
      <Dock className="pointer-events-auto">
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
        <DockSeparator />
        <DockItem>
          <ThemeToggle
            className={actionClassName}
            iconClassName="size-5"
            start="bottom-up"
            variant="circle-blur"
          />
        </DockItem>
      </Dock>
    </nav>
  );
}
