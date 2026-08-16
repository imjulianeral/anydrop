import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Command from "alchemy/Command";
import * as Prisma from "alchemy/Prisma";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import Api from "./infra/Api.ts";
import {
  Connection,
  Database,
  DEV_DATABASE_PORT,
  Project,
} from "./infra/db.ts";
import { lanIPv4 } from "./infra/net.ts";

const webDir = `${import.meta.dirname}/apps/web`;

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
    yield* Project;
    yield* Database;
    yield* Connection;
    const lan = lanIPv4();
    if (lan !== undefined) {
      yield* Command.Dev("PgGateway", {
        command: "nub scripts/pg-gateway.ts",
        env: {
          PG_GATEWAY_LISTEN_HOST: lan,
          PG_GATEWAY_PORT: String(DEV_DATABASE_PORT),
          PG_GATEWAY_TARGET_HOST: "127.0.0.1",
          PG_GATEWAY_TARGET_PORT: String(DEV_DATABASE_PORT),
        },
      });
    }

    const bucket = yield* Cloudflare.R2.Bucket("Bucket");
    const api = yield* Api;

    const website = yield* Cloudflare.Website.Vite("Website", {
      assets: {
        notFoundHandling: "single-page-application",
      },
      dev: { port: 3000 },
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
