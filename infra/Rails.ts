import { AlchemyContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { DEV_DATABASE_PORT, railsDatabaseUrl } from "./db.ts";
import { lanIPv4 } from "./net.ts";
import { railsPort } from "./ports.ts";
import { ExpireSecret, SecretKeyBase } from "./secrets.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

export class Rails extends Cloudflare.Container<Rails>()("Rails", {
  context: backendDir,
  env: {
    ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
    ANYDROP_PG_HOST: Effect.gen(function* () {
      const alchemy = yield* AlchemyContext;
      if (!alchemy.dev) {
        return "";
      }
      return lanIPv4() ?? "";
    }),
    ANYDROP_PG_PORT: String(DEV_DATABASE_PORT),
    DATABASE_URL: railsDatabaseUrl,
    DIRECT_URL: railsDatabaseUrl,
    EXPIRE_SECRET: Effect.gen(function* () {
      const secret = yield* ExpireSecret;
      return secret.text;
    }),
    PORT: String(railsPort),
    RAILS_ENV: "production",
    SECRET_KEY_BASE: Effect.gen(function* () {
      const secret = yield* SecretKeyBase;
      return secret.text;
    }),
  },
  instanceType: "standard-1",
  instances: 1,
  maxInstances: 1,
  observability: { logs: { enabled: true } },
  ports: [{ name: "http", port: railsPort }],
}) {}
