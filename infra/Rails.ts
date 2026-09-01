import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { DatabaseUrl } from "./db.ts";
import { railsPort } from "./ports.ts";
import { ExpireSecret, SecretKeyBase } from "./secrets.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

export class Rails extends Cloudflare.Container<Rails>()(
  "Rails",
  Effect.gen(function* () {
    const databaseUrl = yield* DatabaseUrl;
    const keyBase = yield* SecretKeyBase;
    const expire = yield* ExpireSecret;

    return {
      context: backendDir,
      env: {
        ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
        DATABASE_URL: databaseUrl,
        EXPIRE_SECRET: expire.text,
        SECRET_KEY_BASE: keyBase.text,
        PORT: String(railsPort),
        RAILS_ENV: "production",
      },
      instanceType: "standard-1" as const,
      instances: 1,
      maxInstances: 1,
      observability: { logs: { enabled: true } },
      ports: [{ name: "http", port: railsPort }],
    };
  })
) {}
