import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

import { DatabaseUrl } from "./db.ts";
import { backendPort } from "./ports.ts";
import { BackendSecretKeyBase, ExpireSecret } from "./secrets.ts";

const backendDir = `${import.meta.dirname}/../apps/backend`;

export class ElixirBackend extends Cloudflare.Container<ElixirBackend>()(
  "ElixirBackend",
  Effect.gen(function* () {
    const databaseUrl = yield* DatabaseUrl;
    const keyBase = yield* BackendSecretKeyBase;
    const expire = yield* ExpireSecret;

    return {
      context: backendDir,
      env: {
        ALLOWED_ORIGINS: "http://127.0.0.1:3000,http://localhost:3000",
        DATABASE_URL: databaseUrl,
        EXPIRE_SECRET: expire.text,
        PHX_SERVER: "true",
        PORT: String(backendPort),
        SECRET_KEY_BASE: keyBase.text,
      },
      instanceType: "standard-1" as const,
      instances: 1,
      maxInstances: 1,
      observability: { logs: { enabled: true } },
      ports: [{ name: "http", port: backendPort }],
    };
  })
) {}
