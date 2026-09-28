import { createFileRoute, redirect } from "@tanstack/react-router";

// The links page became the dashboard panel; keep old bookmarks working.
export const Route = createFileRoute("/_app/links")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { panel: "dashboard" }, replace: true });
  },
});
