import { createLink, useRouterState } from "@tanstack/react-router";
import { Link2, Share2 } from "lucide-react";

import { ButtonLink } from "#/components/motion/button/index.tsx";
import { ThemeSwitch } from "#/components/theme-switch.tsx";

const NavButton = createLink(ButtonLink);

const items = [
  { to: "/", label: "Share", icon: Share2 },
  { to: "/links", label: "Links", icon: Link2 },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground flex h-full w-52 shrink-0 flex-col gap-8 border-r px-4 py-8">
      <div className="px-1">
        <p className="text-muted-foreground text-xs tracking-[0.28em] uppercase">
          AnyShare
        </p>
      </div>
      <nav className="flex flex-col gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.to;
          return (
            <NavButton
              key={item.to}
              className="w-full justify-start"
              to={item.to}
              variant={isActive ? "secondary" : "ghost"}
            >
              <Icon />
              {item.label}
            </NavButton>
          );
        })}
      </nav>
      <div className="mt-auto">
        <ThemeSwitch />
      </div>
    </aside>
  );
}
