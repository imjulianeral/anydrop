import * as Alchemy from "alchemy";
import { ALCHEMY_DEV } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Docker from "alchemy/Docker";
import * as Planetscale from "alchemy/Planetscale";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import Api from "./infra/Api.ts";
import { LocalPostgres } from "./infra/db.ts";
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
    if (yield* ALCHEMY_DEV) {
      yield* LocalPostgres;
    }

    const bucket = yield* Cloudflare.R2.Bucket("Bucket");
    const api = yield* Api;
    const website = yield* Cloudflare.Website.Vite("Website", {
      assets: {
        notFoundHandling: "single-page-application",
      },
      dev: { port: websitePort },
      env: {
        VITE_API_URL: api.url.as<string>(),
      },
      rootDir: webDir,
    });

    return {
      apiUrl: api.url,
      bucketName: bucket.bucketName,
      websiteUrl: website.url,
    };
  })
);
