import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppSessionProvider } from "#/components/app-session.tsx";
import { AppSidebar } from "#/components/app-sidebar.tsx";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="bg-background flex h-svh overflow-hidden">
      <AppSidebar />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <AppSessionProvider>
          <Outlet />
        </AppSessionProvider>
      </div>
    </div>
  );
}
