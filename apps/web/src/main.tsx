import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import ReactDOM from "react-dom/client";

import { migrateLegacyStorage } from "#/lib/legacy-storage.ts";

import { routeTree } from "./routeTree.gen";

migrateLegacyStorage();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.querySelector("#app");

if (!rootElement?.innerHTML && rootElement instanceof HTMLElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="phemera.theme"
      // Client-only render: next-themes' inline script never executes, and
      // public/theme-init.js already prevents the theme flash. A data-block
      // type keeps React from warning about the script tag.
      scriptProps={{ type: "application/json" }}
    >
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
