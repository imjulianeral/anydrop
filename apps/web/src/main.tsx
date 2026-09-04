import { RouterProvider, createRouter } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import ReactDOM from "react-dom/client";

import { routeTree } from "./routeTree.gen";

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
      storageKey="anyshare.theme"
    >
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
