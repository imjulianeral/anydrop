import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const config = defineConfig(({ mode }) => ({
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    // `react/compiler-runtime` is injected by the React Compiler transform, so
    // the dep scanner can't see it; pre-bundle it with React to avoid a
    // mid-session re-optimization that loads two React copies.
    include: [
      "react/compiler-runtime",
      "recharts",
      "hash-wasm",
      "libsodium-wrappers",
    ],
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      codeSplittingOptions: {
        // Splitting this file emits `s.$code.tsx?tsr-split=*`, and workerd
        // serves percent-encoded `$` paths as HTML instead of the module.
        splitBehavior: ({ routeId }) => {
          if (routeId === "/s/$code") {
            return [];
          }
        },
      },
    }),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    port: 3000,
    proxy:
      process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED === "1"
        ? undefined
        : {
            "/auth": {
              target:
                process.env.VITE_API_URL ||
                loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL ||
                "http://localhost:4000",
              changeOrigin: true,
            },
          },
  },
}));

export default config;
