import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as Prisma from "alchemy/Prisma";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import Api from "./infra/Api.ts";
import { Hyperdrive } from "./infra/db.ts";
import { websitePort } from "./infra/ports.ts";

const webDir = `${import.meta.dirname}/../apps/web`;

export default Alchemy.Stack(
  "AnyDrop",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      Command.providers(),
      Prisma.providers()
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    yield* Hyperdrive;

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
