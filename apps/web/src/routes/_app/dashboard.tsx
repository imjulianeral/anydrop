import { createFileRoute, redirect } from "@tanstack/react-router";

// The dashboard opens as a panel over the share page; keep old links working.
export const Route = createFileRoute("/_app/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { panel: "dashboard" }, replace: true });
  },
});
