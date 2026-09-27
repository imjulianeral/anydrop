import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

// Design-system components installed from shadcn registries. They own their
// styling, so the rules about restyling components don't apply inside them.
const COMPONENT_LIBRARIES = [
  "apps/web/src/components/ui/**",
  "apps/web/src/components/motion/**",
  "apps/web/src/components/agents/**",
  "apps/web/src/components/crafts/**",
];

// Motion's own style keys, composed into one transform by the animation
// library rather than written as CSS.
const MOTION_TRANSFORM_KEYS = [
  "x",
  "y",
  "z",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "rotateZ",
  "originX",
  "originY",
];

export default defineConfig({
  extends: [core, react, vitest],
  // Scoped to this file only. Vendored trees have their own .oxlintrc.json,
  // so they also need the global ignore in `.eslintignore`.
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "vendors/**",
    "apps/backend/**",
  ],
  jsPlugins: ["@shadcn/lint"],
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
        "shadcn/no-arbitrary-values": ["error", { allow: ["layout"] }],
        "shadcn/no-inline-styles": ["error", { allow: MOTION_TRANSFORM_KEYS }],
        "shadcn/no-raw-colors": "error",
        "shadcn/no-restyle": ["error", { allow: ["layout"] }],
        "shadcn/no-unknown-classes": "error",
        "shadcn/require-static-classes": "error",
        "sort-keys": "off",
      },
    },
    {
      files: COMPONENT_LIBRARIES,
      rules: {
        "shadcn/no-arbitrary-values": "off",
        "shadcn/no-restyle": "off",
        "shadcn/require-static-classes": "off",
      },
    },
    {
      files: ["apps/web/src/components/ui/**"],
      rules: {
        "import/consistent-type-specifier-style": "off",
      },
    },
  ],
  settings: {
    shadcn: {
      ui: "#/components/ui",
    },
  },
});
