import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Scoped to this file only. Vendored trees have their own .oxfmtrc.json,
  // so they also need the global ignore in `.prettierignore`.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "vendors/**",
    "apps/backend/**",
  ],
});
