import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppSessionProvider } from "#/components/app-session.tsx";
import { AppSidebar } from "#/components/app-sidebar.tsx";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppSessionProvider>
      <div className="relative h-svh overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.32_0_0),transparent_55%)]" />
        <div className="relative flex h-full">
          <AppSidebar />
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </AppSessionProvider>
  );
}
