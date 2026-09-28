import { createFileRoute, redirect } from "@tanstack/react-router";

// The links page became the dashboard; keep old bookmarks working.
export const Route = createFileRoute("/_app/links")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
