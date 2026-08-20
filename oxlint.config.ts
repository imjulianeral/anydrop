import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, vitest],
  // Scoped to this file only. Vendored trees have their own .oxlintrc.json,
  // so they also need the global ignore in `.eslintignore`.
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "vendors/**",
    "apps/backend/**",
  ],
  overrides: [
    {
      files: ["alchemy.run.ts"],
      rules: {
        // Alchemy stacks use Effect.gen(function* () { ... }).
        "func-names": "off",
      },
    },
    {
      files: ["infra/**"],
      rules: {
        "filename-case": "off",
        "func-names": "off",
        "func-style": "off",
        "sort-keys": "off",
        "unicorn/filename-case": "off",
      },
    },
    {
      files: ["apps/web/**"],
      rules: {
        "func-style": "off",
        "no-use-before-define": "off",
        "no-void": "off",
        "promise/avoid-new": "off",
        "promise/prefer-await-to-then": "off",
        "react/function-component-definition": "off",
        "sort-keys": "off",
      },
    },
    {
      files: ["apps/web/src/components/ui/**"],
      rules: {
        "import/consistent-type-specifier-style": "off",
      },
    },
  ],
});
