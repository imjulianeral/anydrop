import { Outlet, createFileRoute } from "@tanstack/react-router";
import { PanelLeft } from "lucide-react";

import { AppSessionProvider } from "#/components/app-session.tsx";
import { AppSidebar } from "#/components/app-sidebar.tsx";
import {
  AnimatedSidebarInset,
  AnimatedSidebarProvider,
  AnimatedSidebarTrigger,
} from "#/components/motion/animated-sidebar.tsx";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppSessionProvider>
      <AnimatedSidebarProvider
        className="bg-background h-svh overflow-hidden"
        open={false}
      >
        <AppSidebar />
        <AnimatedSidebarInset className="min-h-0 overflow-hidden">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 md:hidden">
            <AnimatedSidebarTrigger>
              <PanelLeft />
            </AnimatedSidebarTrigger>
            <p className="text-muted-foreground text-xs tracking-[0.28em] uppercase">
              AnyShare
            </p>
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </AnimatedSidebarInset>
      </AnimatedSidebarProvider>
    </AppSessionProvider>
  );
}
