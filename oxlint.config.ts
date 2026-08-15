import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, vitest],
  ignorePatterns: core.ignorePatterns ?? [],
  overrides: [
    {
      files: ["alchemy.run.ts"],
      rules: {
        // Alchemy stacks use Effect.gen(function* () { ... }).
        "func-names": "off",
      },
    },
    {
      files: ["apps/web/**"],
      rules: {
        "func-style": "off",
        "no-use-before-define": "off",
        "react/function-component-definition": "off",
        "sort-keys": "off",
      },
    },
  ],
});
