import {
  createFileRoute,
  lazyRouteComponent,
  notFound,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Suspense, type ReactNode } from "react";

import { ApiError, getShortLink } from "#/lib/api.ts";
import {
  isRouteModuleLoadError,
  shortLinkLoadErrorMessage,
} from "#/lib/short-link.ts";

export const Route = createFileRoute("/s/$code")({
  loader: async ({ params }) => {
    try {
      return await getShortLink(params.code);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 410)
      ) {
        throw notFound();
      }
      throw error;
    }
  },
  component: ShortLinkGate,
  pendingComponent: ShortLinkPending,
  notFoundComponent: ShortLinkUnavailable,
  errorComponent: ShortLinkRouteError,
});

const LazyShortLinkPage = lazyRouteComponent(
  () => import("#/components/short-link-page.tsx"),
  "ShortLinkPage"
);

function ShortLinkGate() {
  return (
    <Suspense fallback={<ShortLinkPending />}>
      <LazyShortLinkPage />
    </Suspense>
  );
}

function ShortLinkPending() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <p className="text-muted-foreground text-sm" role="status">
        Opening link
      </p>
    </main>
  );
}

function ShortLinkUnavailable() {
  return (
    <ShortLinkStatus
      action={<HomeLink />}
      description="This link has expired or is unavailable."
      title="This link is unavailable"
    />
  );
}

function ShortLinkRouteError({ error }: ErrorComponentProps) {
  if (isRouteModuleLoadError(error)) {
    return (
      <ShortLinkStatus
        action={
          <button
            className={actionClassName}
            type="button"
            onClick={() => {
              globalThis.location.reload();
            }}
          >
            Refresh
          </button>
        }
        description="Refresh to try again."
        title="This page failed to load"
      />
    );
  }

  return (
    <ShortLinkStatus
      action={<HomeLink />}
      description={shortLinkLoadErrorMessage(error)}
      title="This link is unavailable"
    />
  );
}

function ShortLinkStatus({
  action,
  description,
  title,
}: {
  action: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      {action}
    </main>
  );
}

const actionClassName =
  "rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4";

function HomeLink() {
  return (
    <a className={actionClassName} href="/">
      Back to AnyShare
    </a>
  );
}
