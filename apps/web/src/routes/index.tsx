import { createFileRoute } from "@tanstack/react-router";

import { ShareApp } from "#/components/share-app.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ShareApp />;
}
