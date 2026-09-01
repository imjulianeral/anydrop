import { Link, useRouterState } from "@tanstack/react-router";
import { Link2, Share2 } from "lucide-react";

import { buttonVariants } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

const items = [
  { to: "/", label: "Share", icon: Share2 },
  { to: "/links", label: "Links", icon: Link2 },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <aside className="border-sidebar-border bg-sidebar/80 text-sidebar-foreground flex h-full w-52 shrink-0 flex-col gap-8 border-r px-4 py-8">
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
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                buttonVariants({
                  variant: isActive ? "secondary" : "ghost",
                }),
                "w-full justify-start"
              )}
            >
              <Icon data-icon="inline-start" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
