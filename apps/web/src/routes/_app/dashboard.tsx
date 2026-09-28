import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "#/components/dashboard/dashboard-page.tsx";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});
