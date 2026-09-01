import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  // Scoped to this file only. Nested vendor configs still win unless
  // `.prettierignore` also excludes `vendors/`.
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "vendors/**",
    "apps/backend/**",
  ],
});
