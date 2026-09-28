import { createFileRoute } from "@tanstack/react-router";

import { ShareApp } from "#/components/share-app.tsx";

const panels = ["dashboard", "devices", "team"] as const;

export const Route = createFileRoute("/_app/")({
  validateSearch: (
    search: Record<string, unknown>
  ): {
    peer?: string;
    peerName?: string;
    message?: string;
    panel?: "dashboard" | "devices" | "team";
  } => ({
    peer: typeof search.peer === "string" ? search.peer : undefined,
    peerName: typeof search.peerName === "string" ? search.peerName : undefined,
    message: typeof search.message === "string" ? search.message : undefined,
    panel: panels.find((panel) => panel === search.panel),
  }),
  component: Home,
});

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ShareApp
      peerId={search.peer}
      peerName={search.peerName}
      messageId={search.message}
      initialPanel={search.panel}
      onSelectPeer={(peer) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            peer: peer.id,
            peerName: peer.display_name,
            message: undefined,
          }),
        });
      }}
    />
  );
}
