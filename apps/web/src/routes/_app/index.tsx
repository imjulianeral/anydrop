import { createFileRoute } from "@tanstack/react-router";

import { ShareApp } from "#/components/share-app.tsx";

export const Route = createFileRoute("/_app/")({
  component: Home,
});

function Home() {
  return <ShareApp />;
}
