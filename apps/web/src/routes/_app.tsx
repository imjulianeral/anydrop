import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppDock } from "#/components/app-dock.tsx";
import { AppSessionProvider } from "#/components/app-session.tsx";
import { DocLinks } from "#/components/doc-page.tsx";
import { MessageNotifications } from "#/components/message-notifications.tsx";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AppSessionProvider>
      <MessageNotifications />
      <div className="bg-background relative h-dvh overflow-hidden [--app-dock-space:calc(6.5rem+env(safe-area-inset-bottom))] sm:[--app-dock-space:calc(5.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
        <footer className="absolute right-5 bottom-[calc(var(--app-dock-space)-1rem)] z-20 sm:right-9 sm:bottom-[max(1rem,env(safe-area-inset-bottom))]">
          <DocLinks />
        </footer>
        <AppDock />
      </div>
    </AppSessionProvider>
  );
}
