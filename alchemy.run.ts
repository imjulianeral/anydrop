import * as Alchemy from "alchemy";
import { ALCHEMY_DEV } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Docker from "alchemy/Docker";
import * as Planetscale from "alchemy/Planetscale";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import Api from "./infra/Api.ts";
import { LocalPostgres } from "./infra/db.ts";
import { Files } from "./infra/files.ts";
import { websitePort } from "./infra/ports.ts";

const webDir = `${import.meta.dirname}/apps/web`;

export default Alchemy.Stack(
  "AnyShare",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      Docker.providers(),
      Planetscale.providers()
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const dev = yield* ALCHEMY_DEV;
    if (dev) {
      yield* LocalPostgres;
    }

    const api = yield* Api;
    const files = yield* Files;
    const website = yield* Cloudflare.Website.Vite("Website", {
      assets: {
        notFoundHandling: "single-page-application",
        // Vite's module-runner WebSocket must bypass the SPA fallback.
        runWorkerFirst: dev ? true : ["/auth/*"],
      },
      dev: { port: websitePort },
      env: {
        API_URL: api.url.as<string>(),
        VITE_API_URL: api.url.as<string>(),
      },
      main: "auth-worker.ts",
      rootDir: webDir,
    });

    return {
      apiUrl: api.url,
      filesBucket: files.bucketName,
      websiteUrl: website.url,
    };
  })
);
