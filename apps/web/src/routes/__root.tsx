import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  Outlet,
  createRootRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { ToastHost } from "#/components/toast-host.tsx";

import "../styles.css";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootError,
});

function RootError({ error }: ErrorComponentProps) {
  const message =
    error instanceof Error ? error.message : "Something went wrong";
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <p className="text-muted-foreground text-sm">{message}</p>
    </main>
  );
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <ToastHost />
      {import.meta.env.DEV ? (
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "TanStack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      ) : null}
    </>
  );
}
