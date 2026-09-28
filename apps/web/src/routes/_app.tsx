import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AccountDevicesProvider } from "#/components/account-devices.tsx";
import { AccountSessionProvider } from "#/components/account-session.tsx";
import { AppSessionProvider } from "#/components/app-session.tsx";
import { DeviceClaimIsland } from "#/components/device-claim-notice.tsx";
import { DocLinks } from "#/components/doc-page.tsx";
import { MessageNotifications } from "#/components/message-notifications.tsx";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <AccountSessionProvider>
      <AppSessionProvider>
        <AccountDevicesProvider>
          <MessageNotifications />
          <DeviceClaimIsland />
          <div className="bg-background relative h-dvh overflow-hidden">
            <Outlet />
            <footer className="absolute right-5 bottom-[calc(var(--app-dock-space)-1rem)] z-20 sm:right-9 sm:bottom-[max(1rem,env(safe-area-inset-bottom))]">
              <DocLinks />
            </footer>
          </div>
        </AccountDevicesProvider>
      </AppSessionProvider>
    </AccountSessionProvider>
  );
}
