import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns ?? [],
  overrides: [
    {
      files: ["alchemy.run.ts"],
      rules: {
        // Alchemy stacks use Effect.gen(function* () { ... }).
        "func-names": "off",
      },
    },
  ],
});
