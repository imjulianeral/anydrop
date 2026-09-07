import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Link2, Share2 } from "lucide-react";

import {
  AnimatedSidebar,
  AnimatedSidebarContent,
  AnimatedSidebarFooter,
  AnimatedSidebarGroup,
  AnimatedSidebarGroupContent,
  AnimatedSidebarHeader,
  AnimatedSidebarMenu,
  AnimatedSidebarMenuButton,
  AnimatedSidebarMenuItem,
  useAnimatedSidebar,
} from "#/components/motion/animated-sidebar.tsx";
import { ThemeSwitch } from "#/components/theme-switch.tsx";

const items = [
  { to: "/", label: "Share", icon: Share2 },
  { to: "/links", label: "Links", icon: Link2 },
] as const;

function SidebarBrand() {
  const { isMobile, open } = useAnimatedSidebar();
  const showLabel = isMobile || open;

  return (
    <div className="flex h-10 items-center px-2">
      {showLabel ? (
        <p className="text-muted-foreground text-xs tracking-[0.28em] uppercase">
          AnyShare
        </p>
      ) : (
        <span className="text-muted-foreground w-full text-center text-xs tracking-[0.18em]">
          AS
        </span>
      )}
    </div>
  );
}

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <AnimatedSidebar ariaLabel="AnyShare" collapsible="icon">
      <AnimatedSidebarHeader>
        <SidebarBrand />
      </AnimatedSidebarHeader>
      <AnimatedSidebarContent>
        <AnimatedSidebarGroup>
          <AnimatedSidebarGroupContent>
            <AnimatedSidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <AnimatedSidebarMenuItem key={item.to}>
                    <AnimatedSidebarMenuButton
                      icon={<Icon />}
                      isActive={pathname === item.to}
                      onSelect={() => {
                        void navigate({ to: item.to });
                      }}
                    >
                      {item.label}
                    </AnimatedSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                );
              })}
            </AnimatedSidebarMenu>
          </AnimatedSidebarGroupContent>
        </AnimatedSidebarGroup>
      </AnimatedSidebarContent>
      <AnimatedSidebarFooter className="items-center">
        <ThemeSwitch />
      </AnimatedSidebarFooter>
    </AnimatedSidebar>
  );
}
