import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  Outlet,
  createRootRoute,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { ToastHost } from "#/components/toast-host.tsx";
import { isRouteModuleLoadError } from "#/lib/short-link.ts";

import "../styles.css";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RootError,
});

function RootError({ error }: ErrorComponentProps) {
  if (isRouteModuleLoadError(error)) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm">This page failed to load.</p>
        <button
          className="rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          type="button"
          onClick={() => {
            globalThis.location.reload();
          }}
        >
          Refresh
        </button>
      </main>
    );
  }

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
