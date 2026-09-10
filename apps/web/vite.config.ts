import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  optimizeDeps: { include: ["recharts"] },
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
  ],
  server: {
    port: 3000,
  },
});

export default config;
