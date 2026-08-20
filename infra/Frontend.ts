import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import Api from "./Api.ts";
import { websitePort } from "./ports.ts";

const webDir = `${import.meta.dirname}/../apps/web`;

export const Frontend = Cloudflare.Website.Vite("Website", {
  assets: {
    notFoundHandling: "single-page-application",
  },
  dev: { port: websitePort },
  env: {
    VITE_API_URL: Effect.gen(function* () {
      const api = yield* Api;
      return api.url.as<string>();
    }),
  },
  rootDir: webDir,
});
