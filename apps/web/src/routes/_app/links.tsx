import { createFileRoute } from "@tanstack/react-router";

import { LinksPage } from "#/components/links-page.tsx";

export const Route = createFileRoute("/_app/links")({
  component: Links,
});

function Links() {
  return <LinksPage />;
}
